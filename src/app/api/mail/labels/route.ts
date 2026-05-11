import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { expandHexColor, MAIL_LABEL_MAX_PER_USER } from "@/lib/mail-labels";
import { getSession } from "@/lib/session";

const hexColor = z
  .string()
  .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Use a hex color like #3b82f6");

const postSchema = z.object({
  name: z.string().trim().min(1, "Name required").max(80),
  color: hexColor,
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const labels = await prisma.mailLabel.findMany({
    where: { userId: session.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json({ labels });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const count = await prisma.mailLabel.count({ where: { userId: session.id } });
  if (count >= MAIL_LABEL_MAX_PER_USER) {
    return NextResponse.json(
      { error: `You can create at most ${MAIL_LABEL_MAX_PER_USER} labels` },
      { status: 400 },
    );
  }

  const name = parsed.data.name;
  const color = expandHexColor(parsed.data.color);

  const dup = await prisma.mailLabel.findFirst({
    where: {
      userId: session.id,
      name: { equals: name, mode: "insensitive" },
    },
  });
  if (dup) {
    return NextResponse.json(
      { error: "You already have a label with this name" },
      { status: 400 },
    );
  }

  const agg = await prisma.mailLabel.aggregate({
    where: { userId: session.id },
    _max: { sortOrder: true },
  });
  const sortOrder = (agg._max.sortOrder ?? -1) + 1;

  const label = await prisma.mailLabel.create({
    data: {
      userId: session.id,
      name,
      color,
      sortOrder,
    },
  });

  return NextResponse.json({ label });
}

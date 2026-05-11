import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { expandHexColor } from "@/lib/mail-labels";

const hexColor = z
  .string()
  .regex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/, "Use a hex color like #3b82f6");

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: hexColor.optional(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  if (parsed.data.name === undefined && parsed.data.color === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const existing = await prisma.mailLabel.findFirst({
    where: { id, userId: session.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Label not found" }, { status: 404 });
  }

  if (parsed.data.name !== undefined) {
    const dup = await prisma.mailLabel.findFirst({
      where: {
        userId: session.id,
        name: { equals: parsed.data.name, mode: "insensitive" },
        NOT: { id },
      },
    });
    if (dup) {
      return NextResponse.json(
        { error: "You already have a label with this name" },
        { status: 400 },
      );
    }
  }

  const label = await prisma.mailLabel.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.color !== undefined
        ? { color: expandHexColor(parsed.data.color) }
        : {}),
    },
  });

  return NextResponse.json({ label });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const existing = await prisma.mailLabel.findFirst({
    where: { id, userId: session.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "Label not found" }, { status: 404 });
  }

  await prisma.mailLabel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

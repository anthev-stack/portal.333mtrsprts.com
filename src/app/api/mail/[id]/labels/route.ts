import { NextResponse } from "next/server";
import { z } from "zod";
import type { MessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const ST: { SENT: MessageStatus } = { SENT: "SENT" };

const postSchema = z.object({
  labelId: z.string().min(1),
});

async function viewerRecipientRow(messageId: string, session: { id: string; internalEmail: string }) {
  const message = await prisma.internalMessage.findFirst({
    where: { id: messageId, status: ST.SENT },
    select: {
      id: true,
      recipients: {
        where: {
          trashedAt: null,
          archived: false,
          OR: [
            { userId: session.id },
            { email: { equals: session.internalEmail, mode: "insensitive" } },
          ],
        },
        select: { id: true },
        take: 1,
      },
    },
  });
  return message?.recipients[0] ?? null;
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: messageId } = await ctx.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const label = await prisma.mailLabel.findFirst({
    where: { id: parsed.data.labelId, userId: session.id },
  });
  if (!label) {
    return NextResponse.json({ error: "Label not found" }, { status: 404 });
  }

  const row = await viewerRecipientRow(messageId, session);
  if (!row) {
    return NextResponse.json({ error: "Message not in your inbox" }, { status: 404 });
  }

  try {
    await prisma.mailRecipientLabel.create({
      data: {
        recipientId: row.id,
        labelId: label.id,
      },
    });
  } catch (e: unknown) {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: string }).code)
        : "";
    if (code === "P2002") {
      return NextResponse.json({ ok: true, already: true });
    }
    throw e;
  }

  return NextResponse.json({
    ok: true,
    label: { id: label.id, name: label.name, color: label.color },
  });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: messageId } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const labelId = searchParams.get("labelId")?.trim();
  if (!labelId) {
    return NextResponse.json({ error: "labelId required" }, { status: 400 });
  }

  const label = await prisma.mailLabel.findFirst({
    where: { id: labelId, userId: session.id },
  });
  if (!label) {
    return NextResponse.json({ error: "Label not found" }, { status: 404 });
  }

  const row = await viewerRecipientRow(messageId, session);
  if (!row) {
    return NextResponse.json({ error: "Message not in your inbox" }, { status: 404 });
  }

  await prisma.mailRecipientLabel.deleteMany({
    where: { recipientId: row.id, labelId },
  });

  return NextResponse.json({ ok: true });
}

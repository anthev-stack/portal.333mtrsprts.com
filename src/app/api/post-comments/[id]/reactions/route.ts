import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const bodySchema = z.object({
  emoji: z.string().min(1).max(16),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: commentId } = await ctx.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const comment = await prisma.postComment.findUnique({ where: { id: commentId } });
  if (!comment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const reaction = await prisma.postCommentReaction.upsert({
    where: {
      commentId_userId_emoji: {
        commentId,
        userId: session.id,
        emoji: parsed.data.emoji,
      },
    },
    create: {
      commentId,
      userId: session.id,
      emoji: parsed.data.emoji,
    },
    update: {},
  });

  return NextResponse.json({ reaction });
}

export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: commentId } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const emoji = searchParams.get("emoji");
  if (!emoji) {
    return NextResponse.json({ error: "emoji required" }, { status: 400 });
  }

  await prisma.postCommentReaction.deleteMany({
    where: { commentId, userId: session.id, emoji },
  });

  return NextResponse.json({ ok: true });
}

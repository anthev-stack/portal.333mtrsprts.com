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

  const { id: postId } = await ctx.params;

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

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const reaction = await prisma.postReaction.upsert({
    where: {
      postId_userId_emoji: {
        postId,
        userId: session.id,
        emoji: parsed.data.emoji,
      },
    },
    create: {
      postId,
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

  const { id: postId } = await ctx.params;
  const { searchParams } = new URL(request.url);
  const emoji = searchParams.get("emoji");
  if (!emoji) {
    return NextResponse.json({ error: "emoji required" }, { status: 400 });
  }

  await prisma.postReaction.deleteMany({
    where: { postId, userId: session.id, emoji },
  });

  return NextResponse.json({ ok: true });
}

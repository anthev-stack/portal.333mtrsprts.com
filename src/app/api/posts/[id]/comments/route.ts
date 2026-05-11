import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { htmlHasMeaningfulBody, stripHtml } from "@/lib/html";

const bodySchema = z
  .object({
    content: z.string(),
  })
  .superRefine((data, ctx) => {
    if (!htmlHasMeaningfulBody(data.content)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Comment cannot be empty",
        path: ["content"],
      });
    }
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
    const msg = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let comment;
  try {
    comment = await prisma.postComment.create({
      data: {
        postId,
        authorId: session.id,
        content: parsed.data.content,
      },
      include: {
        author: { select: { id: true, name: true, imageUrl: true } },
      },
    });
  } catch (e) {
    console.error("[POST /api/posts/.../comments] create failed:", e);
    return NextResponse.json({ error: "Could not save comment" }, { status: 500 });
  }

  if (post.authorId !== session.id) {
    try {
      const preview = stripHtml(parsed.data.content).slice(0, 140);
      await prisma.notification.create({
        data: {
          userId: post.authorId,
          type: "comment",
          title: "New comment on your post",
          body: preview || "(GIF or attachment)",
          link: "/home",
        },
      });
    } catch (e) {
      console.error("[POST /api/posts/.../comments] notification failed:", e);
    }
  }

  return NextResponse.json({
    comment: {
      ...comment,
      _count: { reactions: 0 },
    },
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const postListIncludeFull = {
  author: { select: { id: true, name: true, imageUrl: true } },
  _count: { select: { comments: true, reactions: true } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    take: 200,
    include: {
      author: { select: { id: true, name: true, imageUrl: true } },
      _count: { select: { reactions: true } },
    },
  },
} as const;

const postListIncludeFallback = {
  author: { select: { id: true, name: true, imageUrl: true } },
  _count: { select: { comments: true, reactions: true } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    take: 200,
    include: {
      author: { select: { id: true, name: true, imageUrl: true } },
    },
  },
} as const;

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const posts = await prisma.post.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: postListIncludeFull,
    });
    return NextResponse.json({ posts });
  } catch (err) {
    console.error("[GET /api/posts] primary query failed, using fallback:", err);
    const posts = await prisma.post.findMany({
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 50,
      include: postListIncludeFallback,
    });
    const postsWithReactionShape = posts.map((p) => ({
      ...p,
      comments: p.comments.map((c) => ({
        ...c,
        _count: { reactions: 0 },
      })),
    }));
    return NextResponse.json({ posts: postsWithReactionShape });
  }
}

const createSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  pinned: z.boolean().optional(),
});

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

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const pinned =
    session.role === "ADMIN" ? (parsed.data.pinned ?? false) : false;

  const post = await prisma.post.create({
    data: {
      title: parsed.data.title,
      content: parsed.data.content,
      pinned,
      authorId: session.id,
    },
    include: {
      author: { select: { id: true, name: true, imageUrl: true } },
    },
  });

  if (pinned) {
    const staff = await prisma.user.findMany({
      where: { id: { not: session.id } },
      select: { id: true, notifyInApp: true },
    });

    await prisma.notification.createMany({
      data: staff
        .filter((u) => u.notifyInApp)
        .map((u) => ({
          userId: u.id,
          type: "announcement",
          title: "Pinned update",
          body: post.title,
          link: "/home",
        })),
    });
  }

  return NextResponse.json({ post });
}

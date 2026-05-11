import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({
      posts: [],
      articles: [],
      messages: [],
      forms: [],
    });
  }

  const [posts, articles, messages, forms] = await Promise.all([
    prisma.post.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { content: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 8,
      select: { id: true, title: true, createdAt: true },
    }),
    prisma.knowledgeArticle.findMany({
      where: {
        published: true,
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { content: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 8,
      select: { id: true, title: true, slug: true },
    }),
    prisma.internalMessage.findMany({
      where: {
        status: "SENT",
        OR: [
          {
            recipients: { some: { userId: session.id } },
            subject: { contains: q, mode: "insensitive" },
          },
          {
            recipients: { some: { userId: session.id } },
            body: { contains: q, mode: "insensitive" },
          },
          {
            senderId: session.id,
            subject: { contains: q, mode: "insensitive" },
          },
          {
            senderId: session.id,
            body: { contains: q, mode: "insensitive" },
          },
        ],
      },
      take: 8,
      select: { id: true, subject: true, sentAt: true },
    }),
    session.role === "ADMIN"
      ? prisma.form.findMany({
          where: {
            title: { contains: q, mode: "insensitive" },
          },
          take: 8,
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({ posts, articles, messages, forms });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { slugify } from "@/lib/slug";
import { htmlHasMeaningfulBody } from "@/lib/html";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const tag = searchParams.get("tag")?.trim();

  const articles = await prisma.knowledgeArticle.findMany({
    where: {
      published: true,
      AND: [
        q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { content: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
        tag
          ? {
              tags: { some: { tag: { name: { equals: tag, mode: "insensitive" } } } },
            }
          : {},
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      author: { select: { id: true, name: true, imageUrl: true } },
      tags: { include: { tag: true } },
    },
  });

  return NextResponse.json({ articles });
}

const createSchema = z
  .object({
    title: z.string().min(1),
    content: z.string(),
    excerpt: z.string().optional(),
    category: z.string().optional(),
    tagNames: z.array(z.string()).optional(),
    published: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!htmlHasMeaningfulBody(data.content)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Body cannot be empty",
        path: ["content"],
      });
    }
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
    const msg = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  let base = slugify(parsed.data.title);
  if (!base) base = "article";
  let slug = base;
  let n = 1;
  while (await prisma.knowledgeArticle.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
  }

  const tagNames = [...new Set((parsed.data.tagNames ?? []).map((t) => t.trim()).filter(Boolean))];

  const article = await prisma.$transaction(async (tx) => {
    const a = await tx.knowledgeArticle.create({
      data: {
        title: parsed.data.title,
        slug,
        content: parsed.data.content,
        excerpt: parsed.data.excerpt,
        category: parsed.data.category,
        published: parsed.data.published ?? true,
        authorId: session.id,
      },
    });

    for (const name of tagNames) {
      const tag = await tx.tag.upsert({
        where: { name: name.toLowerCase() },
        create: { name: name.toLowerCase() },
        update: {},
      });
      await tx.articleTag.create({
        data: { articleId: a.id, tagId: tag.id },
      });
    }

    return tx.knowledgeArticle.findUniqueOrThrow({
      where: { id: a.id },
      include: {
        author: { select: { id: true, name: true, imageUrl: true } },
        tags: { include: { tag: true } },
      },
    });
  });

  return NextResponse.json({ article });
}

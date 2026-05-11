import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { slugify } from "@/lib/slug";
import { htmlHasMeaningfulBody } from "@/lib/html";

function canManageArticle(session: { id: string; role: string }, authorId: string) {
  if (session.role === "ADMIN") return true;
  return session.id === authorId;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const article = await prisma.knowledgeArticle.findFirst({
    where: { id, published: true },
    include: {
      author: { select: { id: true, name: true, imageUrl: true } },
      tags: { include: { tag: true } },
      attachments: true,
    },
  });

  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ article });
}

const patchSchema = z
  .object({
    title: z.string().min(1).optional(),
    content: z.string().optional(),
    excerpt: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    tagNames: z.array(z.string()).optional(),
    published: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.title !== undefined ||
      d.content !== undefined ||
      d.excerpt !== undefined ||
      d.category !== undefined ||
      d.tagNames !== undefined ||
      d.published !== undefined,
    { message: "Nothing to update" },
  )
  .superRefine((d, ctx) => {
    if (d.content !== undefined && !htmlHasMeaningfulBody(d.content)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Body cannot be empty",
        path: ["content"],
      });
    }
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
  const existing = await prisma.knowledgeArticle.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canManageArticle(session, existing.authorId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const data = parsed.data;

  if (data.published !== undefined && session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only admins can change published status" },
      { status: 403 },
    );
  }
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) {
    update.title = data.title;
    let base = slugify(data.title);
    if (!base) base = "article";
    let slug = base;
    let n = 1;
    while (
      await prisma.knowledgeArticle.findFirst({
        where: { slug, NOT: { id } },
      })
    ) {
      slug = `${base}-${n++}`;
    }
    update.slug = slug;
  }
  if (data.content !== undefined) update.content = data.content;
  if (data.excerpt !== undefined) update.excerpt = data.excerpt;
  if (data.category !== undefined) update.category = data.category;
  if (data.published !== undefined) update.published = data.published;

  const hasTagUpdate = data.tagNames !== undefined;
  if (
    Object.keys(update).length === 0 &&
    !hasTagUpdate
  ) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const article = await prisma.$transaction(async (tx) => {
    if (Object.keys(update).length > 0) {
      await tx.knowledgeArticle.update({
        where: { id },
        data: update as object,
      });
    }

    if (data.tagNames !== undefined) {
      await tx.articleTag.deleteMany({ where: { articleId: id } });
      const tagNames = [
        ...new Set(data.tagNames.map((t) => t.trim()).filter(Boolean)),
      ];
      for (const name of tagNames) {
        const tag = await tx.tag.upsert({
          where: { name: name.toLowerCase() },
          create: { name: name.toLowerCase() },
          update: {},
        });
        await tx.articleTag.create({
          data: { articleId: id, tagId: tag.id },
        });
      }
    }

    return tx.knowledgeArticle.findUniqueOrThrow({
      where: { id },
      include: {
        author: { select: { id: true, name: true, imageUrl: true } },
        tags: { include: { tag: true } },
        attachments: true,
      },
    });
  });

  return NextResponse.json({ article });
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
  const existing = await prisma.knowledgeArticle.findUnique({
    where: { id },
    select: { authorId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canManageArticle(session, existing.authorId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await prisma.knowledgeArticle.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

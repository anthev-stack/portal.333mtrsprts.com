import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { stripHtml } from "@/lib/html";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default async function KnowledgebasePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim();
  const tag = sp.tag?.trim();

  const articles = await prisma.knowledgeArticle.findMany({
    where: {
      published: true,
      AND: [
        q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { excerpt: { contains: q, mode: "insensitive" } },
                { content: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
        tag
          ? {
              tags: {
                some: { tag: { name: { equals: tag, mode: "insensitive" } } },
              },
            }
          : {},
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      author: { select: { name: true } },
      tags: { include: { tag: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Knowledgebase
          </h1>
          <p className="text-sm text-muted-foreground">
            Collaborative product and company knowledge.
          </p>
        </div>
        <Link
          href="/knowledgebase/new"
          className={cn(buttonVariants({ variant: "default", size: "default" }))}
        >
          New article
        </Link>
      </div>

      <form className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input name="q" placeholder="Search…" defaultValue={q ?? ""} />
        <Input name="tag" placeholder="Tag" defaultValue={tag ?? ""} />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        {articles.map((a) => {
          const excerptTrim = a.excerpt?.trim();
          const fromBody = stripHtml(a.content);
          const preview =
            excerptTrim ||
            (fromBody.length > 0
              ? `${fromBody.slice(0, 200)}${fromBody.length > 200 ? "…" : ""}`
              : null);
          return (
          <Link key={a.id} href={`/knowledgebase/${a.id}`}>
            <Card className="h-full transition-colors hover:bg-accent/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-base leading-snug">{a.title}</CardTitle>
                {preview && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {preview}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {a.author.name}
                  {a.category ? ` · ${a.category}` : ""}
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1">
                {a.tags.map((t) => (
                  <Badge key={t.tagId} variant="outline" className="text-[10px]">
                    {t.tag.name}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          </Link>
          );
        })}
      </div>

      {articles.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No articles match your filters yet.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

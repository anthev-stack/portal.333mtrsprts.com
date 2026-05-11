import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ArticleEditor } from "@/components/portal/article-editor";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const article = await prisma.knowledgeArticle.findFirst({
    where: { id, published: true },
    include: {
      author: { select: { id: true, name: true } },
      tags: { include: { tag: true } },
      attachments: true,
    },
  });

  if (!article) notFound();

  const session = await getSession();
  const canManage =
    session &&
    (session.role === "ADMIN" || session.id === article.authorId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/knowledgebase"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              ← Back
            </Link>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{article.title}</h1>
          {article.excerpt?.trim() && (
            <p className="max-w-3xl text-base text-muted-foreground">
              {article.excerpt.trim()}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {article.author.name}
            {article.category ? ` · ${article.category}` : ""} · Updated{" "}
            {article.updatedAt.toLocaleDateString()}
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            {article.tags.map((t) => (
              <Badge key={t.tagId} variant="secondary">
                {t.tag.name}
              </Badge>
            ))}
          </div>
        </div>
        {canManage && session && (
          <ArticleEditor
            articleId={article.id}
            initialTitle={article.title}
            initialContent={article.content}
            initialExcerpt={article.excerpt ?? ""}
            initialCategory={article.category ?? ""}
            initialTags={article.tags.map((t) => t.tag.name).join(", ")}
            initialPublished={article.published}
            isAdmin={session.role === "ADMIN"}
          />
        )}
      </div>

      <Card>
        <CardContent className="max-w-none py-6">
          <div
            className="prose prose-sm max-w-none text-muted-foreground dark:prose-invert md:prose-base [&_img]:max-w-full [&_img]:rounded-md"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />
        </CardContent>
      </Card>

      {article.attachments.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Attachments</h2>
          <ul className="text-sm text-muted-foreground">
            {article.attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={a.url}
                  download={a.filename}
                  className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
                >
                  {a.filename}
                </a>
                <span className="ml-2 text-xs text-muted-foreground">(download)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

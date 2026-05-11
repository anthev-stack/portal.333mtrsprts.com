import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { HomeFeed } from "@/components/portal/home-feed";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const highlights = await prisma.knowledgeArticle.findMany({
    where: { published: true },
    orderBy: { updatedAt: "desc" },
    take: 4,
    select: {
      id: true,
      title: true,
      excerpt: true,
      category: true,
      updatedAt: true,
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="text-sm text-muted-foreground">
          Announcements, updates, and team conversation.
        </p>
      </div>

      {highlights.length > 0 && (
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fresh from the knowledgebase</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {highlights.map((a) => (
              <Link
                key={a.id}
                href={`/knowledgebase/${a.id}`}
                className="group rounded-lg border bg-card/60 p-4 transition-colors hover:bg-accent/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium leading-snug group-hover:underline">
                    {a.title}
                  </p>
                  {a.category && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {a.category}
                    </Badge>
                  )}
                </div>
                {a.excerpt && (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                    {a.excerpt}
                  </p>
                )}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <HomeFeed />
    </div>
  );
}

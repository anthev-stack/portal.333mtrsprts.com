import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function FormsIndexPage() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/home");

  const forms = await prisma.form.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { responses: true } } },
  });

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Forms</h1>
          <p className="text-sm text-muted-foreground">
            Build internal surveys and share secure links with staff or guests.
          </p>
        </div>
        <Link
          href="/forms/new"
          className={cn(buttonVariants({ variant: "default", size: "default" }))}
        >
          New form
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {forms.map((f) => (
          <Card key={f.id} className="shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">{f.title}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {f._count.responses} responses
                </p>
              </div>
              <div className="flex gap-2">
                {f.isPublic ? (
                  <Badge variant="secondary">Public link</Badge>
                ) : (
                  <Badge variant="outline">Staff only</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Link
                href={`/forms/${f.id}`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                Open builder
              </Link>
              <a
                href={`${origin}/f/${f.shareToken}`}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                Live link
              </a>
            </CardContent>
          </Card>
        ))}
      </div>

      {forms.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No forms yet. Create one for rsvps, feedback, or training confirmations.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

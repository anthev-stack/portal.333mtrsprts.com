import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default async function FormDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") redirect("/home");

  const { id } = await params;
  const form = await prisma.form.findUnique({
    where: { id },
    include: {
      fields: { orderBy: { order: "asc" } },
      responses: {
        orderBy: { submittedAt: "desc" },
        take: 25,
        include: {
          user: { select: { name: true, internalEmail: true } },
          answers: { include: { field: true } },
        },
      },
    },
  });

  if (!form) notFound();

  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/forms"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "mb-2 inline-flex px-0",
            )}
          >
            ← All forms
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{form.title}</h1>
          {form.description && (
            <p className="text-sm text-muted-foreground">{form.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {form.isPublic ? (
              <Badge variant="secondary">Public</Badge>
            ) : (
              <Badge variant="outline">Authenticated only</Badge>
            )}
            <Badge variant="outline">{form.fields.length} fields</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`${origin}/f/${form.shareToken}`}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Open live form
          </a>
          <a
            href={`/api/forms/${form.id}/export`}
            className={cn(buttonVariants({ variant: "default", size: "sm" }))}
          >
            Download CSV
          </a>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent responses</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Respondent</TableHead>
                {form.fields.slice(0, 4).map((f) => (
                  <TableHead key={f.id}>{f.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {form.responses.map((r) => {
                const map = new Map(r.answers.map((a) => [a.fieldId, a.value]));
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {r.submittedAt.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.user
                        ? `${r.user.name}`
                        : "Anonymous"}
                    </TableCell>
                    {form.fields.slice(0, 4).map((f) => (
                      <TableCell key={f.id} className="max-w-[200px] truncate text-xs">
                        {map.get(f.id) ?? "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {form.responses.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No responses yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

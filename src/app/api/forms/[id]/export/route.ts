import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const form = await prisma.form.findUnique({
    where: { id },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  if (!form) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const responses = await prisma.formResponse.findMany({
    where: { formId: id },
    orderBy: { submittedAt: "asc" },
    include: {
      user: { select: { name: true, internalEmail: true } },
      answers: true,
    },
  });

  const headers = [
    "submittedAt",
    "respondent",
    ...form.fields.map((f) => f.label),
  ];

  const lines = [headers.map(escapeCsv).join(",")];

  for (const r of responses) {
    const map = new Map(r.answers.map((a) => [a.fieldId, a.value]));
    const row = [
      r.submittedAt.toISOString(),
      r.user
        ? `${r.user.name} <${r.user.internalEmail}>`
        : "anonymous",
      ...form.fields.map((f) => map.get(f.id) ?? ""),
    ];
    lines.push(row.map((c) => escapeCsv(String(c))).join(","));
  }

  const csv = lines.join("\n");

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="form-${form.id}.csv"`,
    },
  });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

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
  const form = await prisma.form.findUnique({ where: { id } });
  if (!form) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const responses = await prisma.formResponse.findMany({
    where: { formId: id },
    orderBy: { submittedAt: "desc" },
    include: {
      user: { select: { id: true, name: true, internalEmail: true } },
      answers: { include: { field: true } },
    },
  });

  return NextResponse.json({ responses });
}

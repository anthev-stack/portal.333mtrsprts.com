import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const listInclude = {
  createdBy: { select: { id: true, name: true, internalEmail: true } },
  assignments: {
    include: { user: { select: { id: true, name: true, internalEmail: true } } },
  },
} as const;

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const existing = await prisma.customerCareRequest.findUnique({
    where: { id },
    include: { assignments: { select: { userId: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const allowed = existing.assignments.some((a) => a.userId === session.id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (existing.resolvedAt != null) {
    return NextResponse.json({ error: "Already resolved" }, { status: 400 });
  }

  const updated = await prisma.customerCareRequest.update({
    where: { id },
    data: { resolvedAt: new Date() },
    include: listInclude,
  });

  return NextResponse.json({ request: updated });
}

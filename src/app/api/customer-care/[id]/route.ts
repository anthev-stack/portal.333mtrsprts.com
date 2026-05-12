import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const listInclude = {
  createdBy: { select: { id: true, name: true, internalEmail: true, imageUrl: true } },
  assignments: {
    include: {
      user: { select: { id: true, name: true, internalEmail: true, imageUrl: true } },
    },
  },
} as const;

const patchSchema = z.object({
  intent: z.enum(["resolve", "reopen"]),
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
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
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

  const { intent } = parsed.data;

  if (intent === "resolve") {
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

  if (existing.resolvedAt == null) {
    return NextResponse.json({ error: "Not resolved" }, { status: 400 });
  }

  const updated = await prisma.customerCareRequest.update({
    where: { id },
    data: { resolvedAt: null },
    include: listInclude,
  });

  return NextResponse.json({ request: updated });
}

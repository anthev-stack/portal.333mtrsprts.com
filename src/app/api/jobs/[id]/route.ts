import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { progressFromAssignments, type JobAssignmentStatusStr } from "@/lib/jobs-stats";

const jobInclude = {
  createdBy: { select: { id: true, name: true, internalEmail: true } },
  assignments: {
    include: {
      user: { select: { id: true, name: true, internalEmail: true, role: true } },
    },
  },
} as const;

function serializeJob(job: {
  assignments: { status: string }[];
  [k: string]: unknown;
}) {
  return {
    ...job,
    progress: progressFromAssignments(
      job.assignments as { status: JobAssignmentStatusStr }[],
    ),
  };
}

async function canViewJob(session: { id: string; role: string }, jobId: string) {
  if (session.role === "ADMIN") {
    const j = await prisma.job.findUnique({ where: { id: jobId } });
    return j !== null;
  }
  const a = await prisma.jobAssignment.findFirst({
    where: { jobId, userId: session.id },
  });
  return a !== null;
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
  if (!(await canViewJob(session, id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const job = await prisma.job.findUnique({
    where: { id },
    include: jobInclude,
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ job: serializeJob(job) });
}

const patchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  instructions: z.string().min(1).optional(),
});

export async function PATCH(
  request: Request,
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
  if (parsed.data.title === undefined && parsed.data.instructions === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const existing = await prisma.job.findUnique({ where: { id }, select: { archivedAt: true } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (existing.archivedAt != null) {
    return NextResponse.json({ error: "Archived jobs cannot be edited" }, { status: 400 });
  }

  try {
    const job = await prisma.job.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.instructions !== undefined
          ? { instructions: parsed.data.instructions }
          : {}),
      },
      include: jobInclude,
    });
    return NextResponse.json({ job: serializeJob(job) });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
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

  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      isReminder: true,
      archivedAt: true,
      assignments: { select: { userId: true } },
    },
  });
  if (!job) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAssignee = job.assignments.some((a) => a.userId === session.id);

  if (session.role === "ADMIN") {
    try {
      await prisma.job.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  /** Staff may only remove their own completed personal reminders — not team jobs. */
  if (job.isReminder && job.archivedAt != null && isAssignee) {
    try {
      await prisma.job.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

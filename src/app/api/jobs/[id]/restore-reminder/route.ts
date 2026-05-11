import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  EMPTY_JOB_PROGRESS,
  progressFromAssignments,
  type JobAssignmentStatusStr,
} from "@/lib/jobs-stats";

const jobInclude = {
  createdBy: { select: { id: true, name: true, internalEmail: true } },
  assignments: {
    include: {
      user: { select: { id: true, name: true, internalEmail: true, role: true } },
    },
  },
} as const;

/** Move a completed personal reminder back to Active (not archived, assignment reset). */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: { assignments: { select: { userId: true } } },
  });
  if (!job || !job.archivedAt || !job.isReminder) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const assigneeIds = job.assignments.map((a) => a.userId);
  const allowed = session.role === "ADMIN" || assigneeIds.includes(session.id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.$transaction([
    prisma.job.update({
      where: { id },
      data: { archivedAt: null },
    }),
    prisma.jobAssignment.updateMany({
      where: { jobId: id },
      data: {
        status: "NOT_STARTED",
        startedAt: null,
        completedAt: null,
        unableReason: null,
      },
    }),
  ]);

  const updated = await prisma.job.findUniqueOrThrow({
    where: { id },
    include: jobInclude,
  });

  const progress = updated.isReminder
    ? EMPTY_JOB_PROGRESS
    : progressFromAssignments(updated.assignments as { status: JobAssignmentStatusStr }[]);

  return NextResponse.json({
    job: {
      ...updated,
      progress,
    },
  });
}

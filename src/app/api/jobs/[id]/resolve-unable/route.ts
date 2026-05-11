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

const bodySchema = z.object({
  assignmentId: z.string().min(1),
  solution: z.string().trim().min(1, "Please add guidance for the assignee"),
});

/** Admin clears an UNABLE assignment, appends guidance to job instructions, and sets the assignee back to In progress. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: jobId } = await ctx.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { assignmentId, solution } = parsed.data;

  const assignment = await prisma.jobAssignment.findFirst({
    where: { id: assignmentId, jobId },
    include: {
      job: {
        select: {
          archivedAt: true,
          isReminder: true,
          instructions: true,
        },
      },
    },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (assignment.job.archivedAt != null) {
    return NextResponse.json({ error: "This job is archived" }, { status: 400 });
  }
  if (assignment.job.isReminder) {
    return NextResponse.json({ error: "Reminders cannot use this action" }, { status: 400 });
  }
  if (assignment.status !== "UNABLE") {
    return NextResponse.json(
      { error: "Only assignments marked unable to complete can be resumed this way" },
      { status: 400 },
    );
  }

  const now = new Date();
  const stamp = `\n\n---\nAdmin guidance (${now.toISOString().slice(0, 10)}):\n${solution}\n---\n`;

  const updatedJob = await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: jobId },
      data: { instructions: assignment.job.instructions + stamp },
    });
    await tx.jobAssignment.update({
      where: { id: assignmentId },
      data: {
        status: "IN_PROGRESS",
        unableReason: null,
        completedAt: null,
        startedAt: now,
      },
    });
    return tx.job.findUniqueOrThrow({
      where: { id: jobId },
      include: jobInclude,
    });
  });

  return NextResponse.json({
    job: {
      ...updatedJob,
      progress: progressFromAssignments(
        updatedJob.assignments as { status: JobAssignmentStatusStr }[],
      ),
    },
  });
}

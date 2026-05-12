import { NextResponse } from "next/server";
import { z } from "zod";
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

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("complete") }),
  z.object({
    action: z.literal("unable"),
    reason: z.string().trim().min(1, "Please explain why this could not be completed"),
  }),
  z.object({ action: z.literal("undo") }),
]);

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const assignment = await prisma.jobAssignment.findUnique({
    where: { jobId_userId: { jobId, userId: session.id } },
    include: {
      job: {
        select: {
          archivedAt: true,
          createdById: true,
          title: true,
          assignToEveryone: true,
          isReminder: true,
        },
      },
    },
  });
  if (!assignment) {
    return NextResponse.json({ error: "You are not assigned to this job" }, { status: 404 });
  }

  const action = parsed.data.action;
  const undoRestoresArchivedReminder =
    action === "undo" &&
    assignment.job.isReminder &&
    assignment.job.archivedAt != null &&
    assignment.status === "COMPLETED";

  if (assignment.job.archivedAt != null && !undoRestoresArchivedReminder) {
    return NextResponse.json({ error: "This job is archived" }, { status: 400 });
  }

  const now = new Date();

  if (assignment.status === "WAIVED") {
    return NextResponse.json(
      { error: "Another teammate is handling this job. You do not need to take action." },
      { status: 400 },
    );
  }

  if (action === "undo") {
    if (assignment.job.isReminder) {
      if (assignment.status === "COMPLETED" && assignment.job.archivedAt != null) {
        await prisma.$transaction([
          prisma.job.update({
            where: { id: jobId },
            data: { archivedAt: null },
          }),
          prisma.jobAssignment.update({
            where: { id: assignment.id },
            data: {
              status: "NOT_STARTED",
              startedAt: null,
              completedAt: null,
              unableReason: null,
            },
          }),
        ]);
      } else if (assignment.status === "IN_PROGRESS") {
        await prisma.jobAssignment.update({
          where: { id: assignment.id },
          data: { status: "NOT_STARTED", startedAt: null },
        });
      } else {
        return NextResponse.json(
          { error: "Nothing to undo from this reminder" },
          { status: 400 },
        );
      }
    } else if (assignment.status === "IN_PROGRESS") {
      await prisma.$transaction(async (tx) => {
        await tx.jobAssignment.update({
          where: { id: assignment.id },
          data: { status: "NOT_STARTED", startedAt: null },
        });
        if (assignment.job.assignToEveryone) {
          await tx.jobAssignment.updateMany({
            where: { jobId, status: "WAIVED" },
            data: {
              status: "NOT_STARTED",
              startedAt: null,
              completedAt: null,
              unableReason: null,
            },
          });
        }
        await tx.job.update({
          where: { id: jobId },
          data: { adminRejectionReason: null },
        });
      });
    } else if (assignment.status === "COMPLETED") {
      await prisma.jobAssignment.update({
        where: { id: assignment.id },
        data: {
          status: "IN_PROGRESS",
          completedAt: null,
          startedAt: assignment.startedAt ?? now,
        },
      });
    } else if (assignment.status === "UNABLE") {
      await prisma.jobAssignment.update({
        where: { id: assignment.id },
        data: {
          status: "NOT_STARTED",
          unableReason: null,
          completedAt: null,
          startedAt: null,
        },
      });
    } else if (assignment.status === "NOT_STARTED") {
      return NextResponse.json(
        { error: "This assignment is already at the first step" },
        { status: 400 },
      );
    } else {
      return NextResponse.json(
        { error: "Undo is not available for this assignment state" },
        { status: 400 },
      );
    }
  } else if (action === "start") {
    if (assignment.job.isReminder) {
      return NextResponse.json(
        { error: "Reminders use Mark as done only — no separate start step." },
        { status: 400 },
      );
    }
    if (assignment.status !== "NOT_STARTED") {
      return NextResponse.json(
        { error: "Job can only be started from Not started" },
        { status: 400 },
      );
    }

    if (assignment.job.assignToEveryone) {
      const txResult = await prisma.$transaction(async (tx) => {
        const mine = await tx.jobAssignment.updateMany({
          where: { id: assignment.id, status: "NOT_STARTED" },
          data: { status: "IN_PROGRESS", startedAt: now },
        });
        if (mine.count === 0) {
          return false;
        }
        await tx.jobAssignment.updateMany({
          where: { jobId, userId: { not: session.id }, status: "NOT_STARTED" },
          data: {
            status: "WAIVED",
            startedAt: null,
            completedAt: null,
            unableReason: null,
          },
        });
        await tx.job.update({
          where: { id: jobId },
          data: { adminRejectionReason: null },
        });
        return true;
      });
      if (!txResult) {
        return NextResponse.json(
          { error: "This job may have just been claimed by someone else. Refresh and try again." },
          { status: 400 },
        );
      }
    } else {
      await prisma.$transaction([
        prisma.jobAssignment.update({
          where: { id: assignment.id },
          data: { status: "IN_PROGRESS", startedAt: now },
        }),
        prisma.job.update({
          where: { id: jobId },
          data: { adminRejectionReason: null },
        }),
      ]);
    }
  } else if (action === "complete") {
    const reminder = assignment.job.isReminder === true;
    if (reminder) {
      if (assignment.status !== "NOT_STARTED" && assignment.status !== "IN_PROGRESS") {
        return NextResponse.json(
          { error: "This reminder cannot be marked done from its current state." },
          { status: 400 },
        );
      }
      await prisma.$transaction(async (tx) => {
        await tx.jobAssignment.update({
          where: { id: assignment.id },
          data: { status: "COMPLETED", completedAt: now, startedAt: now },
        });
        await tx.job.update({
          where: { id: jobId },
          data: { archivedAt: now },
        });
      });
    } else {
      if (assignment.status !== "IN_PROGRESS") {
        return NextResponse.json(
          { error: "Mark Done is only available while the job is In progress" },
          { status: 400 },
        );
      }
      await prisma.jobAssignment.update({
        where: { id: assignment.id },
        data: { status: "COMPLETED", completedAt: now },
      });
    }
  } else {
    if (assignment.job.isReminder) {
      return NextResponse.json(
        { error: "Reminders cannot be marked unable to complete — mark done or restore from Completed if needed." },
        { status: 400 },
      );
    }
    if (assignment.status === "COMPLETED") {
      return NextResponse.json({ error: "This job is already completed" }, { status: 400 });
    }
    if (assignment.status === "UNABLE") {
      return NextResponse.json({ error: "Already marked unable to complete" }, { status: 400 });
    }
    const reason = parsed.data.reason;
    await prisma.jobAssignment.update({
      where: { id: assignment.id },
      data: {
        status: "UNABLE",
        unableReason: reason,
        completedAt: now,
      },
    });
    const actor = await prisma.user.findUnique({
      where: { id: session.id },
      select: { name: true },
    });
    await prisma.notification.create({
      data: {
        userId: assignment.job.createdById,
        type: "job_unable",
        title: `Unable to complete: ${assignment.job.title}`,
        body: `${actor?.name ?? "A staff member"} could not complete this task.\n\nReason:\n${reason}`,
        link: "/jobs",
      },
    });
  }

  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    include: jobInclude,
  });

  const progress = job.isReminder
    ? EMPTY_JOB_PROGRESS
    : progressFromAssignments(job.assignments as { status: JobAssignmentStatusStr }[]);

  return NextResponse.json({
    job: {
      ...job,
      progress,
    },
  });
}

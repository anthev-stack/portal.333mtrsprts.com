import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { progressFromAssignments, type JobAssignmentStatusStr } from "@/lib/jobs-stats";
import { jobReadyForAdminFinalize } from "@/lib/job-workflow";

const jobInclude = {
  createdBy: { select: { id: true, name: true, internalEmail: true } },
  assignments: {
    include: {
      user: { select: { id: true, name: true, internalEmail: true, role: true } },
    },
  },
} as const;

const bodySchema = z.object({
  reason: z.string().trim().min(1, "Please explain what still needs to be done"),
});

/** Admin sends a job back after assignees marked done, with a note for the team. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
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
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const job = await prisma.job.findUnique({
    where: { id },
    include: { assignments: { select: { status: true } } },
  });
  if (!job || job.archivedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (job.isReminder) {
    return NextResponse.json(
      { error: "Personal reminders are not part of that workflow. Restore from Completed if needed." },
      { status: 400 },
    );
  }
  if (!jobReadyForAdminFinalize({ assignToEveryone: job.assignToEveryone, assignments: job.assignments })) {
    return NextResponse.json(
      { error: "This job is not ready for that action yet (assignees must finish first)." },
      { status: 400 },
    );
  }

  const reason = parsed.data.reason.trim();

  const updated = await prisma.$transaction(async (tx) => {
    await tx.jobAssignment.updateMany({
      where: { jobId: id },
      data: {
        status: "NOT_STARTED",
        startedAt: null,
        completedAt: null,
        unableReason: null,
      },
    });
    return tx.job.update({
      where: { id },
      data: { adminRejectionReason: reason },
      include: jobInclude,
    });
  });

  return NextResponse.json({
    job: {
      ...updated,
      progress: progressFromAssignments(
        updated.assignments as { status: JobAssignmentStatusStr }[],
      ),
    },
  });
}

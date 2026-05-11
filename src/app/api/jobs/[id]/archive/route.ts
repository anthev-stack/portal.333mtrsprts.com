import { NextResponse } from "next/server";
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

/** Admin archives a job when assignee work is finished (all done, or one done + waived for assign-to-everyone). */
export async function POST(
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

  const job = await prisma.job.findUnique({
    where: { id },
    include: { assignments: { select: { status: true } } },
  });
  if (!job || job.archivedAt) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (job.assignments.length === 0) {
    return NextResponse.json({ error: "Job has no assignments" }, { status: 400 });
  }
  if (!jobReadyForAdminFinalize({ assignToEveryone: job.assignToEveryone, assignments: job.assignments })) {
    return NextResponse.json(
      { error: "Assignees must finish this job before you can mark it completed." },
      { status: 400 },
    );
  }

  const updated = await prisma.job.update({
    where: { id },
    data: { archivedAt: new Date(), adminRejectionReason: null },
    include: jobInclude,
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

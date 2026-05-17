import { prisma } from "@/lib/prisma";

export const jobInclude = {
  createdBy: { select: { id: true, name: true, internalEmail: true } },
  assignments: {
    include: {
      user: { select: { id: true, name: true, internalEmail: true, role: true } },
    },
  },
} as const;

export type CreateJobInput = {
  createdById: string;
  title: string;
  instructions: string;
  assignToEveryone: boolean;
  userIds: string[];
  isReminder?: boolean;
  scheduledJobId?: string;
};

export async function createJobWithAssignments(input: CreateJobInput) {
  const {
    createdById,
    title,
    instructions,
    assignToEveryone,
    userIds,
    isReminder = false,
    scheduledJobId,
  } = input;

  const job = await prisma.$transaction(async (tx) => {
    const j = await tx.job.create({
      data: {
        title: title.trim(),
        instructions,
        assignToEveryone,
        createdById,
        isReminder,
        scheduledJobId: scheduledJobId ?? null,
      },
    });
    await tx.jobAssignment.createMany({
      data: userIds.map((userId) => ({
        jobId: j.id,
        userId,
      })),
    });
    return tx.job.findUniqueOrThrow({
      where: { id: j.id },
      include: jobInclude,
    });
  });

  try {
    await notifyJobAssignments(job.title, userIds, isReminder);
  } catch (e) {
    console.error("[createJobWithAssignments] notification createMany failed:", e);
  }

  return job;
}

export async function notifyJobAssignments(
  jobTitle: string,
  assigneeUserIds: string[],
  isReminder: boolean,
) {
  if (isReminder) return;
  const rows = assigneeUserIds.map((userId) => ({
    userId,
    type: "job_assigned",
    title: "You've been assigned a job.",
    body: jobTitle,
    link: "/jobs",
  }));
  if (rows.length === 0) return;
  await prisma.notification.createMany({ data: rows });
}

export async function resolveJobAssigneeUserIds(
  assignToEveryone: boolean,
  assigneeUserIds: string[] | undefined,
): Promise<{ userIds: string[] } | { error: string; status: number }> {
  if (assignToEveryone) {
    const all = await prisma.user.findMany({ select: { id: true } });
    const userIds = all.map((u) => u.id);
    if (userIds.length === 0) {
      return { error: "No users to assign", status: 400 };
    }
    return { userIds };
  }

  const ids = [...new Set(assigneeUserIds ?? [])];
  if (ids.length === 0) {
    return {
      error: "Pick at least one staff member, or assign to everyone",
      status: 400,
    };
  }
  const found = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    return { error: "One or more users not found", status: 400 };
  }
  return { userIds: ids };
}

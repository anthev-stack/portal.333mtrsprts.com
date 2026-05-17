import type { ScheduledJob, ScheduledJobFrequency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createJobWithAssignments,
  resolveJobAssigneeUserIds,
} from "@/lib/create-job";
import { formatScheduledJobSummary } from "@/lib/scheduled-job-format";

export { DAY_OF_WEEK_LABELS, formatScheduledJobSummary } from "@/lib/scheduled-job-format";

export function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDaysUTC(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function clampDayInMonthUTC(year: number, month: number, dayOfMonth: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(dayOfMonth, lastDay);
  return new Date(Date.UTC(year, month, day));
}

/** First run on or after `onOrAfter` (UTC midnight). */
export function computeInitialNextRunAt(
  onOrAfter: Date,
  frequency: ScheduledJobFrequency,
  dayOfWeek: number | null,
  dayOfMonth: number | null,
): Date {
  const start = startOfDayUTC(onOrAfter);

  if (frequency === "WEEKLY" || frequency === "FORTNIGHTLY") {
    const dow = dayOfWeek!;
    let d = new Date(start);
    for (let i = 0; i < 370; i++) {
      if (d.getUTCDay() === dow) return d;
      d = addDaysUTC(d, 1);
    }
    throw new Error("Could not compute next weekly run");
  }

  const dom = dayOfMonth!;
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  for (let i = 0; i < 36; i++) {
    const candidate = clampDayInMonthUTC(y, m, dom);
    if (candidate.getTime() >= start.getTime()) return candidate;
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  throw new Error("Could not compute next monthly run");
}

export function advanceNextRunAfterMaterialize(
  ranOn: Date,
  frequency: ScheduledJobFrequency,
  dayOfMonth: number | null,
): Date {
  const base = startOfDayUTC(ranOn);
  if (frequency === "WEEKLY") return addDaysUTC(base, 7);
  if (frequency === "FORTNIGHTLY") return addDaysUTC(base, 14);
  const dom = dayOfMonth!;
  let y = base.getUTCFullYear();
  let m = base.getUTCMonth() + 1;
  if (m > 11) {
    m = 0;
    y += 1;
  }
  return clampDayInMonthUTC(y, m, dom);
}

type ScheduledWithAssignees = ScheduledJob & {
  assignees: { userId: string }[];
};

async function materializeScheduledJob(schedule: ScheduledWithAssignees, now: Date) {
  const runDayStart = startOfDayUTC(schedule.nextRunAt);
  const runDayEnd = addDaysUTC(runDayStart, 1);

  const existing = await prisma.job.findFirst({
    where: {
      scheduledJobId: schedule.id,
      createdAt: { gte: runDayStart, lt: runDayEnd },
    },
    select: { id: true },
  });

  if (!existing) {
    let userIds: string[];
    if (schedule.assignToEveryone) {
      const resolved = await resolveJobAssigneeUserIds(true, []);
      if ("error" in resolved) {
        console.error(
          `[scheduled-jobs] skip ${schedule.id}: ${resolved.error}`,
        );
        return;
      }
      userIds = resolved.userIds;
    } else {
      userIds = schedule.assignees.map((a) => a.userId);
      if (userIds.length === 0) {
        console.error(`[scheduled-jobs] skip ${schedule.id}: no assignees`);
        return;
      }
    }

    await createJobWithAssignments({
      createdById: schedule.createdById,
      title: schedule.title,
      instructions: schedule.instructions,
      assignToEveryone: schedule.assignToEveryone,
      userIds,
      scheduledJobId: schedule.id,
    });
  }

  const nextRunAt = advanceNextRunAfterMaterialize(
    schedule.nextRunAt,
    schedule.frequency,
    schedule.dayOfMonth,
  );

  await prisma.scheduledJob.update({
    where: { id: schedule.id },
    data: {
      lastRunAt: now,
      nextRunAt,
    },
  });
}

/** Creates jobs for any active schedules whose nextRunAt is due (UTC). */
export async function processDueScheduledJobs(now = new Date()) {
  const due = await prisma.scheduledJob.findMany({
    where: { isActive: true, nextRunAt: { lte: now } },
    include: { assignees: { select: { userId: true } } },
    orderBy: { nextRunAt: "asc" },
  });

  for (const schedule of due) {
    try {
      await materializeScheduledJob(schedule, now);
    } catch (e) {
      console.error(`[scheduled-jobs] failed to materialize ${schedule.id}:`, e);
    }
  }

  return due.length;
}

export const scheduledJobInclude = {
  createdBy: { select: { id: true, name: true, internalEmail: true } },
  assignees: {
    include: {
      user: { select: { id: true, name: true, internalEmail: true, role: true } },
    },
  },
} as const;

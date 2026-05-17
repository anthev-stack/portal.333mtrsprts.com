import { NextResponse } from "next/server";
import { z } from "zod";
import type { ScheduledJobFrequency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { resolveJobAssigneeUserIds } from "@/lib/create-job";
import {
  computeInitialNextRunAt,
  formatScheduledJobSummary,
  processDueScheduledJobs,
  scheduledJobInclude,
} from "@/lib/scheduled-jobs";

function serializeScheduled<T extends Parameters<typeof formatScheduledJobSummary>[0]>(
  row: T & { nextRunAt: Date; lastRunAt: Date | null; createdAt: Date; updatedAt: Date },
) {
  return {
    ...row,
    summary: formatScheduledJobSummary(row),
    nextRunAt: row.nextRunAt.toISOString(),
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const frequencySchema = z.enum(["WEEKLY", "FORTNIGHTLY", "MONTHLY"]);

const createSchema = z
  .object({
    title: z.string().trim().min(1, "Title required"),
    instructions: z.string().min(1, "Instructions required"),
    assignToEveryone: z.boolean(),
    assigneeUserIds: z.array(z.string().min(1)).optional(),
    frequency: frequencySchema,
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.frequency === "WEEKLY" || data.frequency === "FORTNIGHTLY") {
      if (data.dayOfWeek == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "dayOfWeek is required for weekly and fortnightly schedules",
          path: ["dayOfWeek"],
        });
      }
    }
    if (data.frequency === "MONTHLY") {
      if (data.dayOfMonth == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "dayOfMonth is required for monthly schedules",
          path: ["dayOfMonth"],
        });
      }
    }
  });

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await processDueScheduledJobs();
  } catch (e) {
    console.error("[GET /api/jobs/scheduled] processDueScheduledJobs failed:", e);
  }

  const schedules = await prisma.scheduledJob.findMany({
    orderBy: [{ isActive: "desc" }, { nextRunAt: "asc" }],
    include: scheduledJobInclude,
  });

  return NextResponse.json({
    schedules: schedules.map(serializeScheduled),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const {
    title,
    instructions,
    assignToEveryone,
    frequency,
    dayOfWeek,
    dayOfMonth,
  } = parsed.data;

  const resolved = await resolveJobAssigneeUserIds(
    assignToEveryone,
    parsed.data.assigneeUserIds,
  );
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const now = new Date();
  const nextRunAt = computeInitialNextRunAt(
    now,
    frequency as ScheduledJobFrequency,
    frequency === "MONTHLY" ? null : (dayOfWeek ?? null),
    frequency === "MONTHLY" ? (dayOfMonth ?? null) : null,
  );

  const schedule = await prisma.$transaction(async (tx) => {
    const row = await tx.scheduledJob.create({
      data: {
        title: title.trim(),
        instructions,
        assignToEveryone,
        frequency: frequency as ScheduledJobFrequency,
        dayOfWeek: frequency === "MONTHLY" ? null : (dayOfWeek ?? null),
        dayOfMonth: frequency === "MONTHLY" ? (dayOfMonth ?? null) : null,
        nextRunAt,
        createdById: session.id,
        assignees: assignToEveryone
          ? undefined
          : {
              create: resolved.userIds.map((userId) => ({ userId })),
            },
      },
    });
    return tx.scheduledJob.findUniqueOrThrow({
      where: { id: row.id },
      include: scheduledJobInclude,
    });
  });

  try {
    await processDueScheduledJobs();
  } catch (e) {
    console.error("[POST /api/jobs/scheduled] processDueScheduledJobs failed:", e);
  }

  return NextResponse.json({ schedule: serializeScheduled(schedule) });
}

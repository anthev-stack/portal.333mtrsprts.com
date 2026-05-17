import { NextResponse } from "next/server";
import { z } from "zod";
import type { ScheduledJobFrequency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { resolveJobAssigneeUserIds } from "@/lib/create-job";
import {
  computeInitialNextRunAt,
  formatScheduledJobSummary,
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

const patchSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    instructions: z.string().min(1).optional(),
    assignToEveryone: z.boolean().optional(),
    assigneeUserIds: z.array(z.string().min(1)).optional(),
    frequency: z.enum(["WEEKLY", "FORTNIGHTLY", "MONTHLY"]).optional(),
    dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No fields to update",
  });

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

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

  const existing = await prisma.scheduledJob.findUnique({
    where: { id },
    include: { assignees: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const frequency = (parsed.data.frequency ?? existing.frequency) as ScheduledJobFrequency;
  const dayOfWeek =
    parsed.data.dayOfWeek !== undefined
      ? parsed.data.dayOfWeek
      : existing.dayOfWeek;
  const dayOfMonth =
    parsed.data.dayOfMonth !== undefined
      ? parsed.data.dayOfMonth
      : existing.dayOfMonth;

  if (
    (frequency === "WEEKLY" || frequency === "FORTNIGHTLY") &&
    dayOfWeek == null
  ) {
    return NextResponse.json({ error: "dayOfWeek is required" }, { status: 400 });
  }
  if (frequency === "MONTHLY" && dayOfMonth == null) {
    return NextResponse.json({ error: "dayOfMonth is required" }, { status: 400 });
  }

  const assignToEveryone = parsed.data.assignToEveryone ?? existing.assignToEveryone;
  let assigneeIds: string[] | undefined;

  if (
    parsed.data.assignToEveryone !== undefined ||
    parsed.data.assigneeUserIds !== undefined
  ) {
    const resolved = await resolveJobAssigneeUserIds(
      assignToEveryone,
      parsed.data.assigneeUserIds ??
        existing.assignees.map((a) => a.userId),
    );
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    assigneeIds = resolved.userIds;
  }

  const scheduleChanged =
    parsed.data.frequency != null ||
    parsed.data.dayOfWeek !== undefined ||
    parsed.data.dayOfMonth !== undefined;

  const nextRunAt = scheduleChanged
    ? computeInitialNextRunAt(
        new Date(),
        frequency,
        frequency === "MONTHLY" ? null : dayOfWeek,
        frequency === "MONTHLY" ? dayOfMonth : null,
      )
    : undefined;

  const schedule = await prisma.$transaction(async (tx) => {
    await tx.scheduledJob.update({
      where: { id },
      data: {
        ...(parsed.data.title != null ? { title: parsed.data.title.trim() } : {}),
        ...(parsed.data.instructions != null
          ? { instructions: parsed.data.instructions }
          : {}),
        ...(parsed.data.assignToEveryone != null
          ? { assignToEveryone: parsed.data.assignToEveryone }
          : {}),
        ...(parsed.data.frequency != null ? { frequency: parsed.data.frequency } : {}),
        dayOfWeek: frequency === "MONTHLY" ? null : dayOfWeek,
        dayOfMonth: frequency === "MONTHLY" ? dayOfMonth : null,
        ...(parsed.data.isActive != null ? { isActive: parsed.data.isActive } : {}),
        ...(nextRunAt != null ? { nextRunAt } : {}),
      },
    });

    if (assigneeIds && !assignToEveryone) {
      await tx.scheduledJobAssignee.deleteMany({ where: { scheduledJobId: id } });
      await tx.scheduledJobAssignee.createMany({
        data: assigneeIds.map((userId) => ({ scheduledJobId: id, userId })),
      });
    }
    if (assignToEveryone && parsed.data.assignToEveryone === true) {
      await tx.scheduledJobAssignee.deleteMany({ where: { scheduledJobId: id } });
    }

    return tx.scheduledJob.findUniqueOrThrow({
      where: { id },
      include: scheduledJobInclude,
    });
  });

  return NextResponse.json({ schedule: serializeScheduled(schedule) });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

  const existing = await prisma.scheduledJob.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.scheduledJob.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

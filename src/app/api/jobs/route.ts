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

function serializeJob<T extends { assignments: { status: string }[]; isReminder?: boolean }>(job: T) {
  const progress = progressFromAssignments(
    job.assignments as { status: JobAssignmentStatusStr }[],
  );
  if (job.isReminder) {
    return { ...job, progress: EMPTY_JOB_PROGRESS };
  }
  return { ...job, progress };
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") === "archived" ? "archived" : "active";
  const jobWhere =
    scope === "active" ? { archivedAt: null } : { archivedAt: { not: null } };

  if (session.role === "ADMIN") {
    const jobs = await prisma.job.findMany({
      where: jobWhere,
      orderBy: { updatedAt: "desc" },
      include: jobInclude,
    });
    return NextResponse.json({
      role: "ADMIN",
      scope,
      jobs: jobs.map(serializeJob),
    });
  }

  const jobs = await prisma.job.findMany({
    where: {
      ...jobWhere,
      assignments: { some: { userId: session.id } },
    },
    orderBy: { updatedAt: "desc" },
    include: jobInclude,
  });
  return NextResponse.json({
    role: "STAFF",
    scope,
    jobs: jobs.map(serializeJob),
  });
}

const createSchema = z
  .object({
    title: z.string().trim().min(1, "Title required"),
    instructions: z.string().min(1, "Instructions required"),
    selfReminder: z.boolean().optional(),
    assignToEveryone: z.boolean().optional(),
    assigneeUserIds: z.array(z.string().min(1)).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.selfReminder === true) return;
    if (typeof data.assignToEveryone !== "boolean") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "assignToEveryone is required unless selfReminder is true",
        path: ["assignToEveryone"],
      });
    }
  });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "ADMIN" && session.role !== "STAFF") {
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

  if (session.role === "STAFF" && parsed.data.selfReminder !== true) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { title, instructions, selfReminder } = parsed.data;

  let userIds: string[];
  let assignToEveryone: boolean;

  if (selfReminder === true) {
    userIds = [session.id];
    assignToEveryone = false;
  } else {
    assignToEveryone = parsed.data.assignToEveryone!;
    if (assignToEveryone) {
      const all = await prisma.user.findMany({ select: { id: true } });
      userIds = all.map((u) => u.id);
      if (userIds.length === 0) {
        return NextResponse.json({ error: "No users to assign" }, { status: 400 });
      }
    } else {
      const ids = [...new Set(parsed.data.assigneeUserIds ?? [])];
      if (ids.length === 0) {
        return NextResponse.json(
          { error: "Pick at least one staff member, or assign to everyone" },
          { status: 400 },
        );
      }
      const found = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      if (found.length !== ids.length) {
        return NextResponse.json({ error: "One or more users not found" }, { status: 400 });
      }
      userIds = ids;
    }
  }

  const isReminder = selfReminder === true;

  const job = await prisma.$transaction(async (tx) => {
    const j = await tx.job.create({
      data: {
        title: title.trim(),
        instructions,
        assignToEveryone,
        createdById: session.id,
        isReminder,
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
    console.error("[POST /api/jobs] notification createMany failed:", e);
  }

  return NextResponse.json({ job: serializeJob(job) });
}

async function notifyJobAssignments(
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

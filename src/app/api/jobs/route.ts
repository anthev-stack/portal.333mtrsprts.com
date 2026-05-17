import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  EMPTY_JOB_PROGRESS,
  progressFromAssignments,
  type JobAssignmentStatusStr,
} from "@/lib/jobs-stats";
import {
  createJobWithAssignments,
  jobInclude,
  resolveJobAssigneeUserIds,
} from "@/lib/create-job";
import { processDueScheduledJobs } from "@/lib/scheduled-jobs";

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

  if (session.role === "ADMIN") {
    try {
      await processDueScheduledJobs();
    } catch (e) {
      console.error("[GET /api/jobs] processDueScheduledJobs failed:", e);
    }
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
    const resolved = await resolveJobAssigneeUserIds(
      assignToEveryone,
      parsed.data.assigneeUserIds,
    );
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    userIds = resolved.userIds;
  }

  const job = await createJobWithAssignments({
    createdById: session.id,
    title,
    instructions,
    assignToEveryone,
    userIds,
    isReminder: selfReminder === true,
  });

  return NextResponse.json({ job: serializeJob(job) });
}

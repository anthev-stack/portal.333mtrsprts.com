import { NextResponse } from "next/server";
import { z } from "zod";
import { AccountStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { stripHtml } from "@/lib/html";

const createSchema = z.object({
  customerName: z.string().trim().min(1, "Customer name is required"),
  /** Accept string, null, or missing (JSON null from clients must not break email-only submits). */
  customerEmail: z.unknown().optional(),
  customerPhone: z.unknown().optional(),
  query: z.string().trim().min(1, "Question or notes are required"),
  assigneeUserIds: z.array(z.string().min(1)).optional().default([]),
});

const listInclude = {
  createdBy: { select: { id: true, name: true, internalEmail: true, imageUrl: true } },
  assignments: {
    include: {
      user: { select: { id: true, name: true, internalEmail: true, imageUrl: true } },
    },
  },
} as const;

function strFromUnknown(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") === "resolved" ? "resolved" : "active";

  const rows = await prisma.customerCareRequest.findMany({
    where: {
      assignments: { some: { userId: session.id } },
      ...(tab === "resolved"
        ? { resolvedAt: { not: null } }
        : { resolvedAt: null }),
    },
    orderBy: { createdAt: "desc" },
    include: listInclude,
  });

  return NextResponse.json({ requests: rows, tab });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const emailRaw = strFromUnknown(parsed.data.customerEmail).toLowerCase();
  const phoneRaw = strFromUnknown(parsed.data.customerPhone);
  let customerEmail: string | null = null;
  if (emailRaw) {
    const em = z.string().email().safeParse(emailRaw);
    if (!em.success) {
      return NextResponse.json({ error: "Enter a valid email or leave it blank" }, { status: 400 });
    }
    customerEmail = em.data;
  }
  const customerPhone = phoneRaw || null;
  if (!customerEmail && !customerPhone) {
    return NextResponse.json(
      { error: "Provide at least an email or a mobile number for the customer" },
      { status: 400 },
    );
  }

  const assigneeIds = [...new Set([session.id, ...parsed.data.assigneeUserIds])];
  const users = await prisma.user.findMany({
    where: { id: { in: assigneeIds }, accountStatus: AccountStatus.ACTIVE },
    select: { id: true },
  });
  if (users.length !== assigneeIds.length) {
    return NextResponse.json(
      { error: "One or more assignees are invalid or inactive" },
      { status: 400 },
    );
  }

  const preview = stripHtml(parsed.data.query).slice(0, 200);

  const created = await prisma.$transaction(async (tx) => {
    const req = await tx.customerCareRequest.create({
      data: {
        createdById: session.id,
        customerName: parsed.data.customerName.trim(),
        customerEmail,
        customerPhone,
        query: parsed.data.query.trim(),
        assignments: {
          create: assigneeIds.map((userId) => ({ userId })),
        },
      },
      include: listInclude,
    });

    const notifyIds = assigneeIds.filter((id) => id !== session.id);
    if (notifyIds.length > 0) {
      await tx.notification.createMany({
        data: notifyIds.map((userId) => ({
          userId,
          type: "customer_care_assigned",
          title: `Customer care: ${parsed.data.customerName.trim()}`,
          body: preview || "New customer care request",
          link: "/customer-care",
        })),
      });
    }

    return req;
  });

  return NextResponse.json({ request: created });
}

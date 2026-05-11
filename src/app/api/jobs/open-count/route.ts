import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** Assignments for the current user on non-archived jobs that are not yet marked done (COMPLETED). */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await prisma.jobAssignment.count({
    where: {
      userId: session.id,
      status: { notIn: ["COMPLETED", "WAIVED"] },
      job: { archivedAt: null, isReminder: false },
    },
  });

  return NextResponse.json({ count });
}

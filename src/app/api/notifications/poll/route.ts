import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const MAX = 20;

/** Unread in-app notifications for live toast polling. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.notification.findMany({
    where: { userId: session.id, readAt: null },
    orderBy: { createdAt: "asc" },
    take: MAX,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      link: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ notifications: rows });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").toLowerCase().trim();

  const recentRecipients = await prisma.internalMessageRecipient.findMany({
    where: {
      message: { senderId: session.id },
      ...(q
        ? {
            email: { contains: q, mode: "insensitive" },
          }
        : {}),
    },
    select: { email: true },
    orderBy: { message: { updatedAt: "desc" } },
    take: 25,
  });

  const directory = await prisma.user.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { internalEmail: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { internalEmail: true },
    take: 25,
  });

  const emails = [...new Set([...recentRecipients.map((r) => r.email), ...directory.map((u) => u.internalEmail)])];

  return NextResponse.json({ suggestions: emails.slice(0, 20) });
}

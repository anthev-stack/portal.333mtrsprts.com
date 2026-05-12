import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** Active portal users for assignment pickers (e.g. customer care). */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: { accountStatus: "ACTIVE" },
    select: { id: true, name: true, internalEmail: true, role: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ users });
}

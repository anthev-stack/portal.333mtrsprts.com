import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await prisma.customerCareRequest.count({
    where: {
      resolvedAt: null,
      assignments: { some: { userId: session.id } },
    },
  });

  return NextResponse.json({ count });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      role: true,
      internalEmail: true,
      externalEmail: true,
      imageUrl: true,
      address: true,
      phone: true,
      emergencyContact: true,
      emergencyPhone: true,
      position: true,
      department: true,
      themePreference: true,
      notifyEmail: true,
      notifyInApp: true,
      emailFooter: true,
      awayModeEnabled: true,
      awayModeTemplate: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ user });
}

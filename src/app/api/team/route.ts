import { NextResponse } from "next/server";
import { AccountStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** Active staff for the Team directory. Contact block only if the viewer has admin-granted access. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const viewer = await prisma.user.findUnique({
    where: { id: session.id },
    select: { canViewTeamStaffContacts: true, role: true },
  });

  const showStaffContacts = viewer?.canViewTeamStaffContacts === true;

  const users = await prisma.user.findMany({
    where: { accountStatus: AccountStatus.ACTIVE },
    orderBy: [{ teamDirectorySortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      internalEmail: true,
      department: true,
      position: true,
      profileBlurp: true,
      imageUrl: true,
      role: true,
      phone: true,
      address: true,
      emergencyContact: true,
      emergencyPhone: true,
    },
  });

  const members = users.map((u) => ({
    id: u.id,
    name: u.name,
    internalEmail: u.internalEmail,
    department: u.department,
    position: u.position,
    profileBlurp: u.profileBlurp,
    imageUrl: u.imageUrl,
    role: u.role,
    contact: showStaffContacts
      ? {
          phone: u.phone,
          address: u.address,
          emergencyContact: u.emergencyContact,
          emergencyPhone: u.emergencyPhone,
        }
      : null,
  }));

  return NextResponse.json({
    members,
    viewerIsAdmin: session.role === "ADMIN",
    viewerCanViewStaffContacts: showStaffContacts,
  });
}

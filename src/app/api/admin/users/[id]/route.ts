import { NextResponse } from "next/server";
import { z } from "zod";
import { Role, AccountStatus, ThemePreference } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";

function trimNullable(
  v: string | null | undefined,
): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

const patchSchema = z.object({
  imageUrl: z.string().max(2000).nullable().optional(),
  canViewTeamStaffContacts: z.boolean().optional(),
  name: z.string().min(1).optional(),
  externalEmail: z.string().email().optional(),
  department: z.string().max(500).nullable().optional(),
  position: z.string().max(500).nullable().optional(),
  emergencyContact: z.string().max(500).nullable().optional(),
  emergencyPhone: z.string().max(100).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  phone: z.string().max(100).nullable().optional(),
  profileBlurp: z.string().max(600).nullable().optional(),
  role: z.nativeEnum(Role).optional(),
  themePreference: z.nativeEnum(ThemePreference).optional(),
  notifyEmail: z.boolean().optional(),
  notifyInApp: z.boolean().optional(),
  emailFooter: z.string().max(5000).optional(),
  awayModeEnabled: z.boolean().optional(),
  awayModeTemplate: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = parsed.data;

  if (
    data.role !== undefined &&
    data.role !== Role.ADMIN &&
    target.role === Role.ADMIN
  ) {
    const adminCount = await prisma.user.count({
      where: {
        role: Role.ADMIN,
        accountStatus: AccountStatus.ACTIVE,
      },
    });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "Cannot remove the last admin" },
        { status: 400 },
      );
    }
  }

  const department = trimNullable(data.department);
  const position = trimNullable(data.position);
  const emergencyContact = trimNullable(data.emergencyContact);
  const emergencyPhone = trimNullable(data.emergencyPhone);
  const address = trimNullable(data.address);
  const phone = trimNullable(data.phone);
  const profileBlurp = trimNullable(data.profileBlurp);
  const awayModeTemplate =
    data.awayModeTemplate === undefined
      ? undefined
      : trimNullable(data.awayModeTemplate);

  const imageUrl =
    data.imageUrl === undefined
      ? undefined
      : data.imageUrl === null
        ? null
        : data.imageUrl.trim() === ""
          ? null
          : data.imageUrl.trim();

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.externalEmail !== undefined) {
    updateData.externalEmail = data.externalEmail.toLowerCase().trim();
  }
  if (department !== undefined) updateData.department = department;
  if (position !== undefined) updateData.position = position;
  if (emergencyContact !== undefined) {
    updateData.emergencyContact = emergencyContact;
  }
  if (emergencyPhone !== undefined) updateData.emergencyPhone = emergencyPhone;
  if (address !== undefined) updateData.address = address;
  if (phone !== undefined) updateData.phone = phone;
  if (profileBlurp !== undefined) updateData.profileBlurp = profileBlurp;
  if (data.role !== undefined) updateData.role = data.role;
  if (imageUrl !== undefined) updateData.imageUrl = imageUrl;
  if (data.canViewTeamStaffContacts !== undefined) {
    updateData.canViewTeamStaffContacts = data.canViewTeamStaffContacts;
  }
  if (data.themePreference !== undefined) {
    updateData.themePreference = data.themePreference;
  }
  if (data.notifyEmail !== undefined) updateData.notifyEmail = data.notifyEmail;
  if (data.notifyInApp !== undefined) updateData.notifyInApp = data.notifyInApp;
  if (data.emailFooter !== undefined) updateData.emailFooter = data.emailFooter;
  if (data.awayModeEnabled !== undefined) {
    updateData.awayModeEnabled = data.awayModeEnabled;
  }
  if (awayModeTemplate !== undefined) {
    updateData.awayModeTemplate = awayModeTemplate;
  }

  const appliedFields = Object.keys(updateData);

  if (appliedFields.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData as object,
    select: {
      id: true,
      name: true,
      internalEmail: true,
      externalEmail: true,
      role: true,
      department: true,
      position: true,
      imageUrl: true,
      createdAt: true,
      accountStatus: true,
      canViewTeamStaffContacts: true,
      teamDirectorySortOrder: true,
      address: true,
      phone: true,
      emergencyContact: true,
      emergencyPhone: true,
      profileBlurp: true,
      themePreference: true,
      notifyEmail: true,
      notifyInApp: true,
      emailFooter: true,
      awayModeEnabled: true,
      awayModeTemplate: true,
    },
  });

  await writeAuditLog({
    actorId: session.id,
    action: "user.update",
    entityType: "User",
    entityId: user.id,
    metadata: { fields: appliedFields },
  });

  return NextResponse.json({ user });
}

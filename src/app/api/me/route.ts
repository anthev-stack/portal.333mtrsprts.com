import { NextResponse } from "next/server";
import { z } from "zod";
import { ThemePreference } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  externalEmail: z.string().email().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  profileBlurp: z.string().max(600).nullable().optional(),
  themePreference: z.nativeEnum(ThemePreference).optional(),
  notifyEmail: z.boolean().optional(),
  notifyInApp: z.boolean().optional(),
  emailFooter: z.string().max(5000).optional(),
  awayModeEnabled: z.boolean().optional(),
  awayModeTemplate: z.string().nullable().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(10).optional(),
});

export async function PATCH(request: Request) {
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

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const data = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (data.newPassword) {
    if (!data.currentPassword) {
      return NextResponse.json(
        { error: "Current password required" },
        { status: 400 },
      );
    }
    const ok = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { error: "Current password incorrect" },
        { status: 400 },
      );
    }
  }

  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.externalEmail !== undefined) update.externalEmail = data.externalEmail;
  if (data.address !== undefined) update.address = data.address;
  if (data.phone !== undefined) update.phone = data.phone;
  if (data.profileBlurp !== undefined) update.profileBlurp = data.profileBlurp;
  if (data.themePreference !== undefined) {
    update.themePreference = data.themePreference;
  }
  if (data.notifyEmail !== undefined) update.notifyEmail = data.notifyEmail;
  if (data.notifyInApp !== undefined) update.notifyInApp = data.notifyInApp;
  if (data.emailFooter !== undefined) update.emailFooter = data.emailFooter;
  if (data.awayModeEnabled !== undefined) {
    update.awayModeEnabled = data.awayModeEnabled;
  }
  if (data.awayModeTemplate !== undefined) {
    update.awayModeTemplate = data.awayModeTemplate;
  }
  if (data.newPassword) {
    update.passwordHash = await hashPassword(data.newPassword);
  }

  const updated = await prisma.user.update({
    where: { id: session.id },
    data: update as object,
    select: {
      id: true,
      name: true,
      internalEmail: true,
      externalEmail: true,
      role: true,
      address: true,
      phone: true,
      emergencyContact: true,
      emergencyPhone: true,
      position: true,
      department: true,
      profileBlurp: true,
      imageUrl: true,
      themePreference: true,
      notifyEmail: true,
      notifyInApp: true,
      emailFooter: true,
      awayModeEnabled: true,
      awayModeTemplate: true,
    },
  });

  return NextResponse.json({ user: updated });
}

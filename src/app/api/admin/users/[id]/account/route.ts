import { NextResponse } from "next/server";
import { z } from "zod";
import { AccountStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({
  action: z.enum(["pause", "unpause", "delete", "restore"]),
});

export async function POST(
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

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (target.id === session.id) {
    return NextResponse.json(
      { error: "You cannot change your own account this way. Use another admin." },
      { status: 400 },
    );
  }

  const { action } = parsed.data;

  if (action === "pause") {
    if (target.accountStatus !== "ACTIVE") {
      return NextResponse.json({ error: "Only active accounts can be paused" }, { status: 400 });
    }
    if (target.role === Role.ADMIN) {
      const otherActiveAdmins = await prisma.user.count({
        where: {
          role: Role.ADMIN,
          accountStatus: "ACTIVE",
          id: { not: target.id },
        },
      });
      if (otherActiveAdmins === 0) {
        return NextResponse.json(
          { error: "Cannot pause the last active administrator." },
          { status: 400 },
        );
      }
    }
    await prisma.user.update({
      where: { id },
      data: { accountStatus: AccountStatus.PAUSED },
    });
    await writeAuditLog({
      actorId: session.id,
      action: "user.pause",
      entityType: "User",
      entityId: id,
      metadata: { internalEmail: target.internalEmail },
    });
  } else if (action === "unpause") {
    if (target.accountStatus !== "PAUSED") {
      return NextResponse.json({ error: "Account is not paused" }, { status: 400 });
    }
    await prisma.user.update({
      where: { id },
      data: { accountStatus: AccountStatus.ACTIVE },
    });
    await writeAuditLog({
      actorId: session.id,
      action: "user.unpause",
      entityType: "User",
      entityId: id,
      metadata: { internalEmail: target.internalEmail },
    });
  } else if (action === "delete") {
    if (target.accountStatus === "DELETED") {
      return NextResponse.json({ error: "Account is already removed" }, { status: 400 });
    }
    if (target.role === Role.ADMIN) {
      const otherActiveAdmins = await prisma.user.count({
        where: {
          role: Role.ADMIN,
          accountStatus: "ACTIVE",
          id: { not: target.id },
        },
      });
      if (otherActiveAdmins === 0) {
        return NextResponse.json(
          { error: "Cannot remove the last active administrator." },
          { status: 400 },
        );
      }
    }
    await prisma.user.update({
      where: { id },
      data: { accountStatus: AccountStatus.DELETED },
    });
    await writeAuditLog({
      actorId: session.id,
      action: "user.delete_soft",
      entityType: "User",
      entityId: id,
      metadata: { internalEmail: target.internalEmail },
    });
  } else {
    if (target.accountStatus !== "DELETED") {
      return NextResponse.json({ error: "Account is not removed" }, { status: 400 });
    }
    await prisma.user.update({
      where: { id },
      data: { accountStatus: AccountStatus.ACTIVE },
    });
    await writeAuditLog({
      actorId: session.id,
      action: "user.restore",
      entityType: "User",
      entityId: id,
      metadata: { internalEmail: target.internalEmail },
    });
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id },
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
    },
  });

  return NextResponse.json({ user });
}

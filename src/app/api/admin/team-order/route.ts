import { NextResponse } from "next/server";
import { z } from "zod";
import { AccountStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  const orderedIds = parsed.data.orderedIds;
  const unique = new Set(orderedIds);
  if (unique.size !== orderedIds.length) {
    return NextResponse.json({ error: "Duplicate user ids" }, { status: 400 });
  }

  const active = await prisma.user.findMany({
    where: { accountStatus: AccountStatus.ACTIVE },
    select: { id: true },
  });
  const activeSet = new Set(active.map((u) => u.id));
  if (orderedIds.length !== activeSet.size) {
    return NextResponse.json(
      { error: "Order must include every active user exactly once" },
      { status: 400 },
    );
  }
  for (const id of orderedIds) {
    if (!activeSet.has(id)) {
      return NextResponse.json({ error: "Invalid or inactive user id" }, { status: 400 });
    }
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.user.update({
        where: { id },
        data: { teamDirectorySortOrder: index },
      }),
    ),
  );

  await writeAuditLog({
    actorId: session.id,
    action: "team.order_update",
    entityType: "User",
    entityId: null,
    metadata: { count: orderedIds.length },
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import type { MessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const ST: { DRAFT: MessageStatus } = { DRAFT: "DRAFT" };

/** Permanently deletes a draft owned by the current user. */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: messageId } = await ctx.params;

  try {
    const deleted = await prisma.internalMessage.deleteMany({
      where: {
        id: messageId,
        senderId: session.id,
        status: ST.DRAFT,
      },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("mail [id] DELETE", e);
    return NextResponse.json({ error: "Could not delete draft." }, { status: 500 });
  }
}

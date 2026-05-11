import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** Clears read state for the current user’s inbox copy of a message. */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: messageId } = await ctx.params;

  const updated = await prisma.internalMessageRecipient.updateMany({
    where: {
      messageId,
      trashedAt: null,
      OR: [
        { userId: session.id },
        { email: { equals: session.internalEmail, mode: "insensitive" } },
      ],
    },
    data: { readAt: null },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

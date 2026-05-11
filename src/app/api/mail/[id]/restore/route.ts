import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: messageId } = await ctx.params;

  try {
    const msg = await prisma.internalMessage.findFirst({
      where: { id: messageId },
      select: { id: true, senderId: true },
    });
    if (!msg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    const clearedRecipient = await prisma.internalMessageRecipient.updateMany({
      where: {
        messageId,
        trashedAt: { not: null },
        OR: [
          { userId: session.id },
          { email: { equals: session.internalEmail, mode: "insensitive" } },
        ],
      },
      data: { trashedAt: null },
    });

    let clearedSender = 0;
    if (msg.senderId === session.id) {
      const u = await prisma.internalMessage.updateMany({
        where: { id: messageId, senderTrashedAt: { not: null } },
        data: { senderTrashedAt: null },
      });
      clearedSender = u.count;
    }

    if (clearedRecipient.count === 0 && clearedSender === 0) {
      return NextResponse.json({ error: "This message is not in your trash" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("mail restore POST", e);
    return NextResponse.json(
      { error: "Could not restore message." },
      { status: 500 },
    );
  }
}

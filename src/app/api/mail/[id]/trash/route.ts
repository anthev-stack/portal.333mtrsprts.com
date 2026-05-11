import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const bodySchema = z.object({
  from: z.enum(["inbox", "sent"]),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id: messageId } = await ctx.params;
  const now = new Date();

  try {
    if (parsed.data.from === "inbox") {
      const updated = await prisma.internalMessageRecipient.updateMany({
        where: {
          messageId,
          trashedAt: null,
          message: { status: "SENT" },
          OR: [
            { userId: session.id },
            { email: { equals: session.internalEmail, mode: "insensitive" } },
          ],
        },
        data: { trashedAt: now },
      });
      if (updated.count === 0) {
        return NextResponse.json({ error: "Message not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }

    const updated = await prisma.internalMessage.updateMany({
      where: {
        id: messageId,
        senderId: session.id,
        status: "SENT",
        senderTrashedAt: null,
      },
      data: { senderTrashedAt: now },
    });
    if (updated.count === 0) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("mail trash POST", e);
    return NextResponse.json(
      { error: "Could not move message to trash." },
      { status: 500 },
    );
  }
}

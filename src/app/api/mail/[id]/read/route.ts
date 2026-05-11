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

  await prisma.internalMessageRecipient.updateMany({
    where: {
      messageId,
      trashedAt: null,
      OR: [
        { userId: session.id },
        { email: { equals: session.internalEmail, mode: "insensitive" } },
      ],
    },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

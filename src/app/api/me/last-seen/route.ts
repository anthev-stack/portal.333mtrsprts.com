import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const bodySchema = z.object({
  scope: z.enum(["home", "knowledgebase"]),
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

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const now = new Date();
  if (parsed.data.scope === "home") {
    await prisma.user.update({
      where: { id: session.id },
      data: { lastSeenHomeFeedAt: now },
    });
  } else {
    await prisma.user.update({
      where: { id: session.id },
      data: { lastSeenKnowledgebaseAt: now },
    });
  }

  return NextResponse.json({ ok: true });
}

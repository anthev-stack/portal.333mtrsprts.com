import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { countInboxUnreadForUser } from "@/lib/mail-inbox-unread";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await countInboxUnreadForUser({
    id: session.id,
    internalEmail: session.internalEmail,
  });
  return NextResponse.json({ count });
}

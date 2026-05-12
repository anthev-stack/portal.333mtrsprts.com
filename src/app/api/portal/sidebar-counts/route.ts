import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getPortalSidebarCountsForUser } from "@/lib/portal-sidebar-counts";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const counts = await getPortalSidebarCountsForUser(session);
  return NextResponse.json(counts);
}

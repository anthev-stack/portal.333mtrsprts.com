"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { PORTAL_SIDEBAR_COUNTS_EVENT } from "@/lib/portal-sidebar-counts";

export function HomeFeedSeenTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/home") return;
    void fetch("/api/me/last-seen", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "home" }),
    }).then(() => {
      void fetch("/api/portal/sidebar-counts", { credentials: "include" }).then(
        async (res) => {
          if (!res.ok) return;
          const data = await res.json();
          window.dispatchEvent(
            new CustomEvent(PORTAL_SIDEBAR_COUNTS_EVENT, { detail: data }),
          );
        },
      );
    });
  }, [pathname]);

  return null;
}

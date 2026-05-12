"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  PORTAL_SIDEBAR_COUNTS_EVENT,
  type PortalSidebarCountsPayload,
} from "@/lib/portal-sidebar-counts";

const POLL_MS = 22_000;

type PollRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
};

function neutralToast(title: string, description?: string) {
  toast(title, {
    description: description?.trim() || undefined,
    duration: 6500,
    classNames: {
      toast:
        "border-border bg-muted/95 text-foreground shadow-md backdrop-blur-sm dark:bg-muted/90",
      title: "font-medium text-foreground",
      description: "text-muted-foreground text-sm",
    },
  });
}

function formatNotificationToast(n: PollRow) {
  if (n.type === "mail" || n.type === "mail_auto_reply") {
    const email = n.body?.trim();
    neutralToast(
      n.title,
      email ? email : undefined,
    );
    return;
  }
  if (n.type === "job_assigned") {
    neutralToast("You've been assigned a job.", n.body?.trim() || undefined);
    return;
  }
  if (n.type === "customer_care_assigned") {
    neutralToast(n.title, n.body?.trim() || undefined);
    return;
  }
  if (n.type === "comment" || n.type === "feed_comment") {
    neutralToast(n.title, n.body?.trim() || undefined);
    return;
  }
  neutralToast(n.title, n.body?.trim() || undefined);
}

async function markNotificationsRead(ids: string[]) {
  if (ids.length === 0) return;
  await fetch("/api/notifications/mark-read", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

async function emitSidebarCounts() {
  const res = await fetch("/api/portal/sidebar-counts", {
    credentials: "include",
  });
  if (!res.ok) return;
  const data = (await res.json()) as PortalSidebarCountsPayload;
  window.dispatchEvent(
    new CustomEvent(PORTAL_SIDEBAR_COUNTS_EVENT, { detail: data }),
  );
}

export function PortalLiveUpdates() {
  const handling = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (handling.current) return;
      handling.current = true;
      try {
        const res = await fetch("/api/notifications/poll", {
          credentials: "include",
        });
        if (!res.ok || cancelled) {
          if (!cancelled) await emitSidebarCounts();
          return;
        }
        const data = (await res.json()) as { notifications: PollRow[] };
        const list = data.notifications ?? [];

        if (list.length > 0) {
          for (const n of list) {
            if (cancelled) return;
            formatNotificationToast(n);
            await new Promise((r) => setTimeout(r, 280));
          }
          await markNotificationsRead(list.map((n) => n.id));
        }
        await emitSidebarCounts();
      } finally {
        handling.current = false;
      }
    }

    const t = window.setInterval(() => void tick(), POLL_MS);
    const t0 = window.setTimeout(() => void tick(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      window.clearTimeout(t0);
    };
  }, []);

  return null;
}

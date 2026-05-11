"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Briefcase,
  ClipboardList,
  Home,
  Inbox,
  Settings,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PORTAL_MAIL_UNREAD_COUNT_EVENT } from "@/lib/mail-inbox-unread";
import { PORTAL_JOBS_OPEN_COUNT_EVENT } from "@/lib/jobs-open-count";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

async function fetchMailUnreadCount(): Promise<number | null> {
  const res = await fetch("/api/mail/unread-count", { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as { count?: number };
  return typeof data.count === "number" ? data.count : null;
}

async function fetchJobsOpenCount(): Promise<number | null> {
  const res = await fetch("/api/jobs/open-count", { credentials: "include" });
  if (!res.ok) return null;
  const data = (await res.json()) as { count?: number };
  return typeof data.count === "number" ? data.count : null;
}

const links = (
  role: "STAFF" | "ADMIN",
): { href: string; label: string; icon: typeof Home }[] => {
  const base = [
    { href: "/home", label: "Home", icon: Home },
    { href: "/knowledgebase", label: "Knowledgebase", icon: BookOpen },
    { href: "/mail", label: "Mail", icon: Inbox },
    { href: "/jobs", label: "Jobs", icon: Briefcase },
    { href: "/settings", label: "Settings", icon: Settings },
  ];
  if (role === "ADMIN") {
    return [
      ...base.slice(0, 4),
      { href: "/forms", label: "Forms", icon: ClipboardList },
      base[4],
      { href: "/admin", label: "Admin", icon: Shield },
    ];
  }
  return base;
};

export function PortalSidebar({
  role,
  onNavigate,
}: {
  role: "STAFF" | "ADMIN";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = links(role);
  const [mailUnreadCount, setMailUnreadCount] = useState<number | null>(null);
  const [jobsOpenCount, setJobsOpenCount] = useState<number | null>(null);

  const refreshMailUnread = useCallback(async () => {
    const n = await fetchMailUnreadCount();
    if (n !== null) setMailUnreadCount(n);
  }, []);

  const refreshJobsOpen = useCallback(async () => {
    const n = await fetchJobsOpenCount();
    if (n !== null) setJobsOpenCount(n);
  }, []);

  useEffect(() => {
    void refreshMailUnread();
    void refreshJobsOpen();
  }, [pathname, refreshMailUnread, refreshJobsOpen]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refreshMailUnread();
        void refreshJobsOpen();
      }
    };
    const onFocus = () => {
      void refreshMailUnread();
      void refreshJobsOpen();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshMailUnread, refreshJobsOpen]);

  useEffect(() => {
    const onMail = (e: Event) => {
      const ce = e as CustomEvent<{ count?: number }>;
      if (typeof ce.detail?.count === "number") setMailUnreadCount(ce.detail.count);
    };
    const onJobs = (e: Event) => {
      const ce = e as CustomEvent<{ count?: number }>;
      if (typeof ce.detail?.count === "number") setJobsOpenCount(ce.detail.count);
    };
    window.addEventListener(PORTAL_MAIL_UNREAD_COUNT_EVENT, onMail);
    window.addEventListener(PORTAL_JOBS_OPEN_COUNT_EVENT, onJobs);
    return () => {
      window.removeEventListener(PORTAL_MAIL_UNREAD_COUNT_EVENT, onMail);
      window.removeEventListener(PORTAL_JOBS_OPEN_COUNT_EVENT, onJobs);
    };
  }, []);

  return (
    <div className="flex h-full w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="px-4 py-5">
        <div className="leading-tight">
          <p className="text-base font-semibold tracking-wide">333 MOTORSPORTS</p>
          <p className="text-xs font-medium text-muted-foreground">STAFF PORTAL</p>
        </div>
      </div>
      <Separator />
      <ScrollArea className="flex-1 px-2 py-3">
        <nav className="flex flex-col gap-1">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-lg bg-sidebar-accent"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.href === "/mail" &&
                    mailUnreadCount !== null &&
                    mailUnreadCount > 0 && (
                      <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none text-primary">
                        {mailUnreadCount > 99 ? "99+" : mailUnreadCount}
                      </span>
                    )}
                  {item.href === "/jobs" &&
                    jobsOpenCount !== null &&
                    jobsOpenCount > 0 && (
                      <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none text-primary">
                        {jobsOpenCount > 99 ? "99+" : jobsOpenCount}
                      </span>
                    )}
                </span>
              </Link>
            );
          })}
        </nav>
      </ScrollArea>
    </div>
  );
}

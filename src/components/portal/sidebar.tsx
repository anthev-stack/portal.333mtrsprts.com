"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, startTransition } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Briefcase,
  ClipboardList,
  Headphones,
  Home,
  Inbox,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PORTAL_SIDEBAR_COUNTS_EVENT,
  type PortalSidebarCountsPayload,
} from "@/lib/portal-sidebar-counts";
import { PORTAL_MAIL_UNREAD_COUNT_EVENT } from "@/lib/mail-inbox-unread";
import { PORTAL_JOBS_OPEN_COUNT_EVENT } from "@/lib/jobs-open-count";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

async function fetchSidebarCounts(): Promise<PortalSidebarCountsPayload | null> {
  const res = await fetch("/api/portal/sidebar-counts", { credentials: "include" });
  if (!res.ok) return null;
  return (await res.json()) as PortalSidebarCountsPayload;
}

type NavItem = { href: string; label: string; icon: typeof Home };

function navSections(role: "STAFF" | "ADMIN"): { primary: NavItem[]; footer: NavItem[] } {
  const primary: NavItem[] = [
    { href: "/home", label: "Home", icon: Home },
    { href: "/knowledgebase", label: "Knowledgebase", icon: BookOpen },
    { href: "/customer-care", label: "Customer care", icon: Headphones },
    { href: "/mail", label: "Mail", icon: Inbox },
    { href: "/jobs", label: "Jobs", icon: Briefcase },
  ];
  if (role === "ADMIN") {
    primary.push({ href: "/forms", label: "Forms", icon: ClipboardList });
  }
  const footer: NavItem[] = [
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/team", label: "Team", icon: Users },
  ];
  if (role === "ADMIN") {
    footer.push({ href: "/admin", label: "Admin", icon: Shield });
  }
  return { primary, footer };
}

function CountChip({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none text-primary">
      {n > 99 ? "99+" : n}
    </span>
  );
}

function SidebarNavLink({
  item,
  pathname,
  counts,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  counts: PortalSidebarCountsPayload | null;
  onNavigate?: () => void;
}) {
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const mailN = item.href === "/mail" ? (counts?.mail ?? 0) : 0;
  const jobsN = item.href === "/jobs" ? (counts?.jobs ?? 0) : 0;
  const homeN = item.href === "/home" ? (counts?.home ?? 0) : 0;
  const kbN =
    item.href === "/knowledgebase" ? (counts?.knowledgebase ?? 0) : 0;
  const careN =
    item.href === "/customer-care" ? (counts?.customerCare ?? 0) : 0;
  return (
    <Link
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
        {item.href === "/home" && <CountChip n={homeN} />}
        {item.href === "/knowledgebase" && <CountChip n={kbN} />}
        {item.href === "/customer-care" && <CountChip n={careN} />}
        {item.href === "/mail" && <CountChip n={mailN} />}
        {item.href === "/jobs" && <CountChip n={jobsN} />}
      </span>
    </Link>
  );
}

export function PortalSidebar({
  role,
  onNavigate,
}: {
  role: "STAFF" | "ADMIN";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { primary, footer } = navSections(role);
  const [counts, setCounts] = useState<PortalSidebarCountsPayload | null>(null);

  const applyCounts = useCallback((c: PortalSidebarCountsPayload) => {
    setCounts(c);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const c = await fetchSidebarCounts();
      if (cancelled || !c) return;
      startTransition(() => applyCounts(c));
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, applyCounts]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        const c = await fetchSidebarCounts();
        if (!c) return;
        startTransition(() => applyCounts(c));
      })();
    };
    const onFocus = () => {
      void (async () => {
        const c = await fetchSidebarCounts();
        if (!c) return;
        startTransition(() => applyCounts(c));
      })();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [applyCounts]);

  useEffect(() => {
    const onFull = (e: Event) => {
      const ce = e as CustomEvent<PortalSidebarCountsPayload>;
      if (
        ce.detail &&
        typeof ce.detail.mail === "number" &&
        typeof ce.detail.jobs === "number" &&
        typeof ce.detail.home === "number" &&
        typeof ce.detail.knowledgebase === "number" &&
        typeof ce.detail.customerCare === "number"
      ) {
        startTransition(() => applyCounts(ce.detail));
      }
    };
    const onMail = (e: Event) => {
      const ce = e as CustomEvent<{ count?: number }>;
      if (typeof ce.detail?.count !== "number") return;
      startTransition(() => {
        setCounts((prev) => ({
          mail: ce.detail.count!,
          jobs: prev?.jobs ?? 0,
          home: prev?.home ?? 0,
          knowledgebase: prev?.knowledgebase ?? 0,
          customerCare: prev?.customerCare ?? 0,
        }));
      });
    };
    const onJobs = (e: Event) => {
      const ce = e as CustomEvent<{ count?: number }>;
      if (typeof ce.detail?.count !== "number") return;
      startTransition(() => {
        setCounts((prev) => ({
          mail: prev?.mail ?? 0,
          jobs: ce.detail.count!,
          home: prev?.home ?? 0,
          knowledgebase: prev?.knowledgebase ?? 0,
          customerCare: prev?.customerCare ?? 0,
        }));
      });
    };
    window.addEventListener(PORTAL_SIDEBAR_COUNTS_EVENT, onFull);
    window.addEventListener(PORTAL_MAIL_UNREAD_COUNT_EVENT, onMail);
    window.addEventListener(PORTAL_JOBS_OPEN_COUNT_EVENT, onJobs);
    return () => {
      window.removeEventListener(PORTAL_SIDEBAR_COUNTS_EVENT, onFull);
      window.removeEventListener(PORTAL_MAIL_UNREAD_COUNT_EVENT, onMail);
      window.removeEventListener(PORTAL_JOBS_OPEN_COUNT_EVENT, onJobs);
    };
  }, [applyCounts]);

  return (
    <div className="flex h-full w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="px-4 py-5">
        <div className="leading-tight">
          <p className="text-base font-semibold tracking-wide">333 MOTORSPORTS</p>
          <p className="text-xs font-medium text-muted-foreground">STAFF PORTAL</p>
        </div>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1 px-2 py-3">
        <nav className="flex flex-col gap-1">
          {primary.map((item) => (
            <SidebarNavLink
              key={item.href}
              item={item}
              pathname={pathname}
              counts={counts}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </ScrollArea>
      <Separator className="shrink-0" />
      <div className="shrink-0 px-2 py-3">
        <nav className="flex flex-col gap-1" aria-label="Account and administration">
          {footer.map((item) => (
            <SidebarNavLink
              key={item.href}
              item={item}
              pathname={pathname}
              counts={counts}
              onNavigate={onNavigate}
            />
          ))}
        </nav>
      </div>
    </div>
  );
}

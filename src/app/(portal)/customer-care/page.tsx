"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PORTAL_SIDEBAR_COUNTS_EVENT } from "@/lib/portal-sidebar-counts";

type DirUser = {
  id: string;
  name: string;
  internalEmail: string;
  role: string;
  imageUrl: string | null;
};

type CareUser = {
  id: string;
  name: string;
  internalEmail: string;
  imageUrl: string | null;
};

type CareRequest = {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  orderNumber: string | null;
  trackingNumber: string | null;
  query: string;
  resolvedAt: string | null;
  createdAt: string;
  createdBy: CareUser;
  assignments: { user: CareUser }[];
};

function formatCareDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function emitSidebarCounts() {
  const res = await fetch("/api/portal/sidebar-counts", { credentials: "include" });
  if (!res.ok) return;
  const data = await res.json();
  window.dispatchEvent(
    new CustomEvent(PORTAL_SIDEBAR_COUNTS_EVENT, { detail: data }),
  );
}

function AssigneeAvatars({ assignments }: { assignments: CareRequest["assignments"] }) {
  return (
    <div className="flex shrink-0 items-center pl-0.5">
      <div className="flex -space-x-1.5">
        {assignments.map((a) => (
          <Tooltip key={a.user.id}>
            <TooltipTrigger className="inline-flex cursor-default rounded-full border-0 bg-transparent p-0">
              <Avatar className="size-7 border-2 border-background ring-0">
                <AvatarImage src={a.user.imageUrl?.trim() || undefined} alt="" />
                <AvatarFallback className="text-[10px]">
                  {a.user.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {a.user.name}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

export default function CustomerCarePage() {
  const [meId, setMeId] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "resolved">("active");
  const [requests, setRequests] = useState<CareRequest[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [directory, setDirectory] = useState<DirUser[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [query, setQuery] = useState("");
  const [extraAssignees, setExtraAssignees] = useState<Record<string, boolean>>({});

  const loadList = useCallback(async (t: "active" | "resolved") => {
    setListLoading(true);
    setRequests([]);
    try {
      const res = await fetch(`/api/customer-care?tab=${t}`, { credentials: "include" });
      if (!res.ok) {
        setRequests([]);
        return;
      }
      const d = (await res.json()) as { requests: CareRequest[] };
      setRequests(d.requests);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadStatic = useCallback(async () => {
    const [meRes, dirRes] = await Promise.all([
      fetch("/api/auth/me", { credentials: "include" }),
      fetch("/api/users/directory", { credentials: "include" }),
    ]);
    if (meRes.ok) {
      const d = (await meRes.json()) as { user: { id: string } };
      setMeId(d.user.id);
    }
    if (dirRes.ok) {
      const d = (await dirRes.json()) as { users: DirUser[] };
      setDirectory(d.users);
    }
  }, []);

  useEffect(() => {
    void loadStatic();
  }, [loadStatic]);

  useEffect(() => {
    void loadList(tab);
  }, [tab, loadList]);

  function resetForm() {
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setOrderNumber("");
    setTrackingNumber("");
    setQuery("");
    setExtraAssignees({});
  }

  async function submit() {
    const emailT = customerEmail.trim();
    const phoneT = customerPhone.trim();
    if (!emailT && !phoneT) {
      toast.error("Add at least an email or a mobile number for the customer.");
      return;
    }

    setBusy(true);
    try {
      const assigneeUserIds = Object.entries(extraAssignees)
        .filter(([, v]) => v)
        .map(([id]) => id);
      const payload: Record<string, unknown> = {
        customerName,
        query,
        assigneeUserIds,
      };
      if (emailT) payload.customerEmail = emailT;
      if (phoneT) payload.customerPhone = phoneT;
      const orderT = orderNumber.trim();
      const trackingT = trackingNumber.trim();
      if (orderT) payload.orderNumber = orderT;
      if (trackingT) payload.trackingNumber = trackingT;

      const res = await fetch("/api/customer-care", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "Could not save");
        return;
      }
      toast.success("Customer care entry logged");
      setOpen(false);
      resetForm();
      setTab("active");
      await loadList("active");
      await emitSidebarCounts();
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id: string) {
    const res = await fetch(`/api/customer-care/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "resolve" }),
    });
    if (!res.ok) {
      toast.error("Could not mark resolved");
      return;
    }
    toast.success("Marked resolved");
    await loadList(tab);
    await emitSidebarCounts();
  }

  async function reopen(id: string) {
    const res = await fetch(`/api/customer-care/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "reopen" }),
    });
    if (!res.ok) {
      toast.error("Could not reopen");
      return;
    }
    toast.success("Reopened");
    await loadList(tab);
    await emitSidebarCounts();
  }

  const others = directory.filter((u) => u.id !== meId);

  const emptyMessage =
    tab === "active"
      ? "No open entries. Create one when a customer needs a callback or research."
      : "No resolved entries yet.";

  function renderCards() {
    if (listLoading) {
      return (
        <p className="text-sm text-muted-foreground">Loading…</p>
      );
    }
    if (requests.length === 0) {
      return (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </CardContent>
        </Card>
      );
    }
    return (
      <div className="space-y-2">
        {requests.map((r) => (
          <Card key={r.id} className="overflow-hidden py-0 shadow-sm">
            <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium leading-tight">{r.customerName}</span>
                  {r.resolvedAt ? (
                    <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px]">
                      Resolved
                    </Badge>
                  ) : (
                    <Badge className="h-5 shrink-0 px-1.5 text-[10px]">Open</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>Created {formatCareDate(r.createdAt)}</span>
                  {r.resolvedAt && (
                    <span>Resolved {formatCareDate(r.resolvedAt)}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  {r.customerEmail && <span className="truncate">Email: {r.customerEmail}</span>}
                  {r.customerPhone && <span>Mobile: {r.customerPhone}</span>}
                </div>
                {(r.orderNumber || r.trackingNumber) && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {r.orderNumber && (
                      <span className="truncate font-medium text-foreground/80">Order: {r.orderNumber}</span>
                    )}
                    {r.trackingNumber && (
                      <span className="truncate font-medium text-foreground/80">Tracking: {r.trackingNumber}</span>
                    )}
                  </div>
                )}
                <p className="line-clamp-2 whitespace-pre-wrap text-xs leading-snug text-foreground">
                  {r.query}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Logged by {r.createdBy.name}
                </p>
              </div>
              <div className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-end">
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Assigned
                  </span>
                  <AssigneeAvatars assignments={r.assignments} />
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {!r.resolvedAt && (
                    <Button size="sm" className="h-7 text-xs" variant="outline" onClick={() => void resolve(r.id)}>
                      Mark resolved
                    </Button>
                  )}
                  {r.resolvedAt && (
                    <Button size="sm" className="h-7 text-xs" variant="secondary" onClick={() => void reopen(r.id)}>
                      Reactivate
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider delay={200}>
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customer care</h1>
          <p className="text-sm text-muted-foreground">
            Log calls and follow-ups when you cannot answer immediately. You are always included;
            add teammates to help.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 size-4" />
          New entry
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "active" | "resolved")}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4 space-y-2 outline-none">
          {renderCards()}
        </TabsContent>
        <TabsContent value="resolved" className="mt-4 space-y-2 outline-none">
          {renderCards()}
        </TabsContent>
      </Tabs>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New customer care entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="cc-name">Customer name</Label>
              <Input
                id="cc-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-email">Email (optional)</Label>
              <Input
                id="cc-email"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-phone">Mobile (optional)</Label>
              <Input
                id="cc-phone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+64 …"
              />
            </div>
            <p className="text-xs text-muted-foreground">At least one of email or mobile is required.</p>
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <p className="text-xs font-medium text-muted-foreground">Order details (optional)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cc-order">Order number</Label>
                  <Input
                    id="cc-order"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="e.g. web order ID"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cc-tracking">Tracking number</Label>
                  <Input
                    id="cc-tracking"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="Carrier tracking ref"
                    autoComplete="off"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Use when the customer is following up on an order or shipment so the team can look it up
                quickly.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc-q">Question / notes</Label>
              <Textarea
                id="cc-q"
                rows={4}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What does the customer need answered?"
              />
            </div>
            <div className="space-y-2">
              <Label>Also assign</Label>
              <p className="text-xs text-muted-foreground">
                You are always assigned automatically. Select teammates to notify and include on this
                request.
              </p>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                {others.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No other active users.</p>
                ) : (
                  others.map((u) => (
                    <label
                      key={u.id}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={!!extraAssignees[u.id]}
                        onCheckedChange={(c) =>
                          setExtraAssignees((prev) => ({
                            ...prev,
                            [u.id]: c === true,
                          }))
                        }
                      />
                      <Avatar className="size-7">
                        <AvatarImage src={u.imageUrl?.trim() || undefined} alt="" />
                        <AvatarFallback className="text-[10px]">{u.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span>
                        {u.name}{" "}
                        <span className="text-muted-foreground">({u.internalEmail})</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  );
}

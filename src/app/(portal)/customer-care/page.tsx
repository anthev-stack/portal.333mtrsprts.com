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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PORTAL_SIDEBAR_COUNTS_EVENT } from "@/lib/portal-sidebar-counts";

type DirUser = { id: string; name: string; internalEmail: string; role: string };

type CareRequest = {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  query: string;
  resolvedAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string; internalEmail: string };
  assignments: { user: { id: string; name: string; internalEmail: string } }[];
};

async function emitSidebarCounts() {
  const res = await fetch("/api/portal/sidebar-counts", { credentials: "include" });
  if (!res.ok) return;
  const data = await res.json();
  window.dispatchEvent(
    new CustomEvent(PORTAL_SIDEBAR_COUNTS_EVENT, { detail: data }),
  );
}

export default function CustomerCarePage() {
  const [meId, setMeId] = useState<string | null>(null);
  const [requests, setRequests] = useState<CareRequest[]>([]);
  const [directory, setDirectory] = useState<DirUser[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [query, setQuery] = useState("");
  const [extraAssignees, setExtraAssignees] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const [meRes, listRes, dirRes] = await Promise.all([
      fetch("/api/auth/me", { credentials: "include" }),
      fetch("/api/customer-care", { credentials: "include" }),
      fetch("/api/users/directory", { credentials: "include" }),
    ]);
    if (meRes.ok) {
      const d = (await meRes.json()) as { user: { id: string } };
      setMeId(d.user.id);
    }
    if (listRes.ok) {
      const d = (await listRes.json()) as { requests: CareRequest[] };
      setRequests(d.requests);
    }
    if (dirRes.ok) {
      const d = (await dirRes.json()) as { users: DirUser[] };
      setDirectory(d.users);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setQuery("");
    setExtraAssignees({});
  }

  async function submit() {
    setBusy(true);
    try {
      const assigneeUserIds = Object.entries(extraAssignees)
        .filter(([, v]) => v)
        .map(([id]) => id);
      const res = await fetch("/api/customer-care", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName,
          customerEmail: customerEmail.trim() || null,
          customerPhone: customerPhone.trim() || null,
          query,
          assigneeUserIds,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? "Could not save");
        return;
      }
      toast.success("Customer care entry logged");
      setOpen(false);
      resetForm();
      await load();
      await emitSidebarCounts();
    } finally {
      setBusy(false);
    }
  }

  async function resolve(id: string) {
    const res = await fetch(`/api/customer-care/${id}`, {
      method: "PATCH",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error("Could not mark resolved");
      return;
    }
    toast.success("Marked resolved");
    await load();
    await emitSidebarCounts();
  }

  const others = directory.filter((u) => u.id !== meId);

  return (
    <div className="space-y-8">
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

      <div className="grid gap-4">
        {requests.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No entries yet. Create one when a customer needs a callback or research.
            </CardContent>
          </Card>
        ) : (
          requests.map((r) => (
            <Card key={r.id}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 pb-2">
                <div>
                  <CardTitle className="text-base">{r.customerName}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Logged by {r.createdBy.name} · {new Date(r.createdAt).toLocaleString()}
                  </p>
                </div>
                {r.resolvedAt ? (
                  <Badge variant="secondary">Resolved</Badge>
                ) : (
                  <Badge variant="default">Open</Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {r.customerEmail && <span>Email: {r.customerEmail}</span>}
                  {r.customerPhone && <span>Mobile: {r.customerPhone}</span>}
                </div>
                <p className="whitespace-pre-wrap text-foreground">{r.query}</p>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Assigned</p>
                  <p className="text-xs">
                    {r.assignments.map((a) => a.user.name).join(", ")}
                  </p>
                </div>
                {!r.resolvedAt && (
                  <Button size="sm" variant="outline" onClick={() => void resolve(r.id)}>
                    Mark resolved
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

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
  );
}

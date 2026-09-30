"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PORTAL_SIDEBAR_COUNTS_EVENT } from "@/lib/portal-sidebar-counts";

type Status = "NEW" | "REVIEWING" | "CONTACTED" | "ARCHIVED";

type Suggestion = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  productName: string | null;
  description: string;
  extraNotes: string | null;
  shopifyCustomerId: string | null;
  photoUrl: string | null;
  photoFilename: string | null;
  status: Status;
  staffNote: string | null;
  createdAt: string;
};

const TABS: { id: Status; label: string }[] = [
  { id: "NEW", label: "New" },
  { id: "REVIEWING", label: "In review" },
  { id: "CONTACTED", label: "Contacted" },
  { id: "ARCHIVED", label: "Archived" },
];

function formatDate(iso: string) {
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

export default function ProductSuggestionsPage() {
  const [tab, setTab] = useState<Status>("NEW");
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (status: Status) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/product-suggestions?tab=${status}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setRows([]);
        return;
      }
      const data = (await res.json()) as { suggestions: Suggestion[] };
      setRows(data.suggestions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  async function setStatus(id: string, status: Status) {
    const res = await fetch(`/api/product-suggestions/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error("Could not update");
      return;
    }
    toast.success("Updated");
    await load(tab);
    await emitSidebarCounts();
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Lightbulb className="size-6" />
          Product suggestions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Submissions from 333mtrsprts.com. Follow up with the customer by email when you take a product on.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Status)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.id} value={t.id} className="mt-4 space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : rows.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No suggestions in this list.
                </CardContent>
              </Card>
            ) : (
              rows.map((s) => (
                <Card key={s.id} className="overflow-hidden py-0 shadow-sm">
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
                    {s.photoUrl ? (
                      <a
                        href={s.photoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 overflow-hidden rounded-md border bg-muted"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={s.photoUrl}
                          alt={s.photoFilename || "Suggested product"}
                          className="h-28 w-28 object-cover"
                        />
                      </a>
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        <Badge className="h-5 px-1.5 text-[10px]">{t.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <a className="underline-offset-2 hover:underline" href={`mailto:${s.email}`}>
                          {s.email}
                        </a>
                        {s.phone ? ` · ${s.phone}` : ""}
                        {s.shopifyCustomerId ? ` · Shopify #${s.shopifyCustomerId}` : ""}
                      </p>
                      {s.productName ? (
                        <p className="text-sm font-medium">{s.productName}</p>
                      ) : null}
                      <p className="whitespace-pre-wrap text-sm">{s.description}</p>
                      {s.extraNotes ? (
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          Extra: {s.extraNotes}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {s.status !== "REVIEWING" ? (
                          <Button size="sm" variant="outline" onClick={() => setStatus(s.id, "REVIEWING")}>
                            In review
                          </Button>
                        ) : null}
                        {s.status !== "CONTACTED" ? (
                          <Button size="sm" variant="outline" onClick={() => setStatus(s.id, "CONTACTED")}>
                            Mark contacted
                          </Button>
                        ) : null}
                        {s.status !== "ARCHIVED" ? (
                          <Button size="sm" variant="ghost" onClick={() => setStatus(s.id, "ARCHIVED")}>
                            Archive
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setStatus(s.id, "NEW")}>
                            Restore
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

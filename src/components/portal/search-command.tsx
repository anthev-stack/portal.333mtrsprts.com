"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type SearchResult = {
  posts: { id: string; title: string }[];
  articles: { id: string; title: string }[];
  messages: { id: string; subject: string }[];
  forms: { id: string; title: string }[];
};

export function SearchCommand({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [data, setData] = useState<SearchResult | null>(null);

  useEffect(() => {
    if (!open) {
      setQ("");
      setData(null);
    }
  }, [open]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setData(null);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        setData((await res.json()) as SearchResult);
      })();
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="sr-only">Search</DialogTitle>
        </DialogHeader>
        <div className="border-b px-3 pb-3">
          <Input
            autoFocus
            placeholder="Search posts, articles, mail, forms…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 border-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <ScrollArea className="max-h-80">
          <div className="space-y-3 p-3 text-sm">
            {!data && q.length >= 2 && (
              <p className="text-muted-foreground">Searching…</p>
            )}
            {data && (
              <>
                {data.posts.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">
                      Home & announcements
                    </p>
                    <ul className="space-y-1">
                      {data.posts.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
                            onClick={() => go("/home")}
                          >
                            {p.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.articles.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">
                      Knowledgebase
                    </p>
                    <ul className="space-y-1">
                      {data.articles.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
                            onClick={() => go(`/knowledgebase/${a.id}`)}
                          >
                            {a.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.messages.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">
                      Mail
                    </p>
                    <ul className="space-y-1">
                      {data.messages.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
                            onClick={() => go("/mail")}
                          >
                            {m.subject}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.forms.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">
                      Forms
                    </p>
                    <ul className="space-y-1">
                      {data.forms.map((f) => (
                        <li key={f.id}>
                          <button
                            type="button"
                            className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent"
                            onClick={() => go(`/forms/${f.id}`)}
                          >
                            {f.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.posts.length === 0 &&
                  data.articles.length === 0 &&
                  data.messages.length === 0 &&
                  data.forms.length === 0 && (
                    <p className="text-muted-foreground">No results.</p>
                  )}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

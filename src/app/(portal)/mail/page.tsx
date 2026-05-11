"use client";

import {
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Forward,
  GripVertical,
  Mail,
  MailOpen,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RichEditor } from "@/components/portal/rich-editor";
import { cn } from "@/lib/utils";
import { hexForColorInput, MAIL_LABEL_MAX_PER_USER } from "@/lib/mail-labels";
import { PORTAL_MAIL_UNREAD_COUNT_EVENT } from "@/lib/mail-inbox-unread";

type MailLabelDto = { id: string; name: string; color: string };

type Msg = {
  id: string;
  subject: string;
  body: string;
  sentAt: string | null;
  status?: "DRAFT" | "SENT";
  sender?: { name: string; internalEmail: string };
  viewerReadAt?: string | null;
  /** Present for `folder=trash`: when this copy was moved to trash (30-day retention from this time). */
  viewerTrashedAt?: string;
  /** Inbox only: labels applied to your copy of the message. */
  viewerLabels?: MailLabelDto[];
  recipients?: {
    email: string;
    kind?: "TO" | "CC" | "BCC";
    readAt: string | null;
    user?: { name: string; internalEmail: string } | null;
  }[];
  attachments?: {
    id: string;
    filename: string;
    url: string;
    mimeType: string | null;
    size: number | null;
  }[];
};

function formatNames(
  recipients: Msg["recipients"],
  kinds: ("TO" | "CC" | "BCC")[],
): string {
  if (!recipients?.length) return "";
  return recipients
    .filter((r) => kinds.includes((r.kind ?? "TO") as "TO" | "CC" | "BCC"))
    .map((r) => r.user?.name ?? r.email)
    .join(", ");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/** Reads `{ error }` from JSON bodies even when `Content-Type` is missing (e.g. some proxies). */
async function parseMailApiError(res: Response, fallback: string): Promise<string> {
  if (res.status === 401) return "Session expired. Sign in again.";
  const text = await res.text();
  if (text) {
    try {
      const data = JSON.parse(text) as { error?: unknown };
      if (typeof data.error === "string" && data.error.trim()) {
        return data.error.trim();
      }
    } catch {
      /* not JSON */
    }
  }
  return `${fallback} (HTTP ${res.status}).`;
}

function attachmentsEqual(
  a: { filename: string; url: string }[],
  b: { filename: string; url: string }[],
) {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.url === b[i]?.url && x.filename === b[i]?.filename);
}

function formatTrashPurgeDate(trashedAtIso: string): string {
  const d = new Date(trashedAtIso);
  d.setTime(d.getTime() + 30 * 24 * 60 * 60 * 1000);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function MailDragPreview({ message }: { message: Msg }) {
  return (
    <div className="pointer-events-none flex w-[min(34rem,calc(100vw-1.5rem))] cursor-grabbing select-none rounded-xl border border-border/90 bg-card/95 p-4 shadow-2xl ring-1 ring-foreground/10 backdrop-blur-sm dark:bg-card/90">
      <div className="flex shrink-0 text-muted-foreground pt-0.5">
        <GripVertical className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-2 pl-1">
        <p className="truncate text-sm font-semibold leading-snug">{message.subject}</p>
        <p className="text-xs text-muted-foreground">
          {message.sender ? `From ${message.sender.name}` : "Message"}
          {message.sentAt ? ` · ${new Date(message.sentAt).toLocaleString()}` : ""}
        </p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{stripHtml(message.body)}</p>
      </div>
    </div>
  );
}

function InboxDragHandle({
  messageId,
  disabled,
}: {
  messageId: string;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `mail-${messageId}`,
    disabled,
  });
  if (disabled) return null;
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={cn(
        "mt-0.5 shrink-0 touch-manipulation rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground",
        isDragging && "cursor-grabbing",
      )}
      title="Drag onto a label"
      aria-label="Drag message onto a label"
      onClick={(e) => e.stopPropagation()}
      {...listeners}
      {...attributes}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
}

function MailLabelDropRow({
  label,
  filterSelected,
  onToggleFilter,
}: {
  label: MailLabelDto;
  filterSelected: boolean;
  onToggleFilter: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `label-${label.id}` });
  return (
    <div ref={setNodeRef} className="rounded-lg px-0.5">
      <button
        type="button"
        onClick={onToggleFilter}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-[background-color,box-shadow] duration-150",
          filterSelected
            ? "border-primary/40 bg-primary/10 font-medium"
            : "border-transparent hover:bg-accent/60",
          isOver && !filterSelected && "border-transparent bg-accent",
          isOver && filterSelected && "bg-primary/25",
        )}
      >
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: label.color }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{label.name}</span>
      </button>
    </div>
  );
}

/** Read / Unread labels plus envelope: closed when unread, open when read. Double-click the open envelope to mark unread again. */
function InboxReadStatus({
  viewerReadAt,
  messageId,
  size = "list",
  onMarkUnread,
}: {
  viewerReadAt: string | null | undefined;
  messageId: string;
  size?: "list" | "header";
  onMarkUnread: (id: string) => void;
}) {
  const iconClass = size === "header" ? "size-4" : "size-3";
  const unread = viewerReadAt == null;

  if (unread) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background shadow-sm dark:bg-primary dark:text-primary-foreground dark:shadow-none">
          Unread
        </span>
        <span className="text-muted-foreground" title="Unread" aria-hidden>
          <Mail className={iconClass} />
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
        Read
      </span>
      <button
        type="button"
        className="touch-manipulation rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Double-click or double-tap to mark unread"
        aria-label="Mark as unread (double-click or double-tap open envelope)"
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onMarkUnread(messageId);
        }}
      >
        <MailOpen className={iconClass} aria-hidden />
      </button>
    </span>
  );
}

/** Shown directly under the recipient field while typing (not a separate panel). */
function InlineRecipientSuggestions({
  show,
  suggestions,
  onPick,
}: {
  show: boolean;
  suggestions: string[];
  onPick: (email: string) => void;
}) {
  if (!show || suggestions.length === 0) return null;
  return (
    <ul
      className="absolute left-0 right-0 top-full z-20 mt-0.5 max-h-44 overflow-auto rounded-md border bg-popover py-1 text-popover-foreground shadow-md"
      role="listbox"
    >
      {suggestions.slice(0, 8).map((s) => (
        <li key={s} role="presentation">
          <button
            type="button"
            className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            role="option"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(s)}
          >
            {s}
          </button>
        </li>
      ))}
    </ul>
  );
}

type ComposeBaseline = {
  subject: string;
  toEmails: string[];
  ccEmails: string[];
  bccEmails: string[];
  bodyHtml: string;
  attachments: { filename: string; url: string; mimeType: string | null; size: number | null }[];
  toInput: string;
  ccInput: string;
  bccInput: string;
};

export default function MailPage() {
  const [folder, setFolder] = useState<"inbox" | "sent" | "drafts" | "trash">("inbox");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  /** When set, compose POST includes `id` to update an existing draft. */
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [composeSession, setComposeSession] = useState(0);
  const [composeQuitOpen, setComposeQuitOpen] = useState(false);
  const composeBaselineRef = useRef<ComposeBaseline | null>(null);
  const [toInput, setToInput] = useState("");
  const [toEmails, setToEmails] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState("");
  const [ccEmails, setCcEmails] = useState<string[]>([]);
  const [bccInput, setBccInput] = useState("");
  const [bccEmails, setBccEmails] = useState<string[]>([]);
  const [recipientFocus, setRecipientFocus] = useState<"to" | "cc" | "bcc">("to");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("<p></p>");
  const [attachments, setAttachments] = useState<
    { filename: string; url: string; mimeType: string | null; size: number | null }[]
  >([]);
  const [replyBodyHtml, setReplyBodyHtml] = useState("<p></p>");
  const [replyAttachments, setReplyAttachments] = useState<
    { filename: string; url: string; mimeType: string | null; size: number | null }[]
  >([]);
  const [me, setMe] = useState<{ emailFooter: string; internalEmail: string } | null>(
    null,
  );
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [mailLabels, setMailLabels] = useState<MailLabelDto[]>([]);
  const [selectedFilterLabelIds, setSelectedFilterLabelIds] = useState<string[]>([]);
  const [newLabelOpen, setNewLabelOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#3b82f6");
  const [editingLabel, setEditingLabel] = useState<MailLabelDto | null>(null);
  const [editLabelName, setEditLabelName] = useState("");
  const [editLabelColor, setEditLabelColor] = useState("#3b82f6");
  const [activeMailDragId, setActiveMailDragId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const suggestQuery =
    recipientFocus === "to"
      ? toInput
      : recipientFocus === "cc"
        ? ccInput
        : bccInput;

  const allComposeEmails = useMemo(
    () => new Set([...toEmails, ...ccEmails, ...bccEmails]),
    [toEmails, ccEmails, bccEmails],
  );

  const selectedMessage =
    selectedMessageId == null
      ? null
      : (messages.find((m) => m.id === selectedMessageId) ?? null);

  const listMessages = useMemo(() => {
    if (folder !== "inbox" || selectedFilterLabelIds.length === 0) return messages;
    return messages.filter((m) =>
      selectedFilterLabelIds.some((lid) =>
        (m.viewerLabels ?? []).some((v) => v.id === lid),
      ),
    );
  }, [folder, messages, selectedFilterLabelIds]);

  const activeMailDragMessage = useMemo(
    () =>
      activeMailDragId
        ? (messages.find((x) => x.id === activeMailDragId) ?? null)
        : null,
    [activeMailDragId, messages],
  );

  const isReadingMessage = Boolean(selectedMessageId) && !composeOpen;

  async function loadMailLabels() {
    const res = await fetch("/api/mail/labels", { credentials: "include" });
    if (!res.ok) return;
    const data = (await res.json()) as { labels: MailLabelDto[] };
    setMailLabels(data.labels);
  }

  function toggleFilterLabel(id: string) {
    setSelectedFilterLabelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function assignLabelToMessage(messageId: string, labelId: string) {
    const labelMeta = mailLabels.find((l) => l.id === labelId);
    if (!labelMeta) return;
    const res = await fetch(`/api/mail/${messageId}/labels`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ labelId }),
    });
    if (!res.ok) {
      toast.error(await parseMailApiError(res, "Could not apply label"));
      return;
    }
    toast.success(`Added “${labelMeta.name}”`);
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const cur = m.viewerLabels ?? [];
        if (cur.some((l) => l.id === labelId)) return m;
        return {
          ...m,
          viewerLabels: [
            ...cur,
            { id: labelMeta.id, name: labelMeta.name, color: labelMeta.color },
          ],
        };
      }),
    );
  }

  function handleMailDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const am = /^mail-(.+)$/.exec(String(active.id));
    const ol = /^label-(.+)$/.exec(String(over.id));
    if (!am || !ol) return;
    void assignLabelToMessage(am[1], ol[1]);
  }

  async function removeLabelFromMessage(messageId: string, labelId: string) {
    const res = await fetch(
      `/api/mail/${messageId}/labels?labelId=${encodeURIComponent(labelId)}`,
      { method: "DELETE", credentials: "include" },
    );
    if (!res.ok) {
      toast.error(await parseMailApiError(res, "Could not remove label"));
      return;
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              viewerLabels: (m.viewerLabels ?? []).filter((l) => l.id !== labelId),
            }
          : m,
      ),
    );
  }

  async function createMailLabel() {
    const name = newLabelName.trim();
    if (!name) {
      toast.error("Name required");
      return;
    }
    const res = await fetch("/api/mail/labels", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, color: newLabelColor }),
    });
    if (!res.ok) {
      toast.error(await parseMailApiError(res, "Could not create label"));
      return;
    }
    toast.success("Label created");
    setNewLabelOpen(false);
    setNewLabelName("");
    setNewLabelColor("#3b82f6");
    await loadMailLabels();
  }

  async function saveEditedMailLabel() {
    if (!editingLabel) return;
    const name = editLabelName.trim();
    if (!name) {
      toast.error("Name required");
      return;
    }
    const body: { name?: string; color?: string } = {};
    if (name !== editingLabel.name) body.name = name;
    if (editLabelColor !== editingLabel.color) body.color = editLabelColor;
    if (Object.keys(body).length === 0) {
      setEditingLabel(null);
      return;
    }
    const res = await fetch(`/api/mail/labels/${editingLabel.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error(await parseMailApiError(res, "Could not update label"));
      return;
    }
    const data = (await res.json()) as { label: MailLabelDto };
    const updated = data.label;
    setMailLabels((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        viewerLabels: (m.viewerLabels ?? []).map((l) =>
          l.id === updated.id
            ? { ...l, name: updated.name, color: updated.color }
            : l,
        ),
      })),
    );
    toast.success("Label updated");
    setEditingLabel(null);
  }

  async function deleteMailLabel(labelId: string) {
    const res = await fetch(`/api/mail/labels/${labelId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error(await parseMailApiError(res, "Could not delete label"));
      return;
    }
    toast.success("Label deleted");
    setMailLabels((prev) => prev.filter((l) => l.id !== labelId));
    setSelectedFilterLabelIds((prev) => prev.filter((x) => x !== labelId));
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        viewerLabels: (m.viewerLabels ?? []).filter((l) => l.id !== labelId),
      })),
    );
  }

  function resetComposeRecipients() {
    setToInput("");
    setToEmails([]);
    setCcInput("");
    setCcEmails([]);
    setBccInput("");
    setBccEmails([]);
    setRecipientFocus("to");
  }

  async function load(): Promise<boolean> {
    const res = await fetch(`/api/mail?folder=${folder}&inboxUnread=1`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      toast.error(await parseMailApiError(res, "Could not load messages"));
      return false;
    }
    const data = (await res.json()) as { messages: Msg[]; inboxUnreadCount?: number };
    setMessages(Array.isArray(data.messages) ? data.messages : []);
    if (typeof data.inboxUnreadCount === "number") {
      setInboxUnreadCount(data.inboxUnreadCount);
    }
    return true;
  }

  async function refreshMail() {
    const ok = await load();
    await loadMailLabels();
    if (ok) toast.success("Mail refreshed");
  }

  async function trashMessage(messageId: string, from: "inbox" | "sent") {
    const res = await fetch(`/api/mail/${messageId}/trash`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from }),
    });
    if (!res.ok) {
      toast.error(await parseMailApiError(res, "Could not move to trash"));
      return;
    }
    toast.success("Moved to Trash");
    if (selectedMessageId === messageId) setSelectedMessageId(null);
    await load();
  }

  async function restoreFromTrash(messageId: string) {
    const res = await fetch(`/api/mail/${messageId}/restore`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error(await parseMailApiError(res, "Could not restore message"));
      return;
    }
    toast.success("Restored to mailbox");
    if (selectedMessageId === messageId) setSelectedMessageId(null);
    await load();
  }

  useEffect(() => {
    if (folder !== "inbox") {
      setSelectedFilterLabelIds([]);
    }
    void load();
  }, [folder]);

  useEffect(() => {
    void loadMailLabels();
  }, []);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(PORTAL_MAIL_UNREAD_COUNT_EVENT, {
        detail: { count: inboxUnreadCount },
      }),
    );
  }, [inboxUnreadCount]);

  useEffect(() => {
    setSelectedMessageId(null);
  }, [folder]);

  useEffect(() => {
    if (
      selectedMessageId &&
      !messages.some((m) => m.id === selectedMessageId)
    ) {
      setSelectedMessageId(null);
    }
  }, [messages, selectedMessageId]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return;
      const data = (await res.json()) as {
        user: { emailFooter: string; internalEmail: string };
      };
      setMe(data.user);
    })();
  }, []);

  useLayoutEffect(() => {
    if (!composeOpen) return;
    composeBaselineRef.current = {
      subject,
      toEmails: [...toEmails],
      ccEmails: [...ccEmails],
      bccEmails: [...bccEmails],
      bodyHtml,
      attachments: attachments.map((a) => ({ ...a })),
      toInput,
      ccInput,
      bccInput,
    };
  }, [composeSession, composeOpen]);

  async function uploadFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      throw new Error("Upload failed");
    }
    const data = (await res.json()) as {
      url: string;
      filename: string;
      mimeType: string | null;
      size: number | null;
    };
    return data;
  }

  async function attachDocument(file: File) {
    const uploaded = await uploadFile(file);
    setAttachments((prev) => [
      ...prev,
      {
        filename: uploaded.filename,
        url: uploaded.url,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
      },
    ]);
  }

  function isComposeDirty(): boolean {
    const b = composeBaselineRef.current;
    if (!b || !composeOpen) return false;
    if (subject.trim() !== b.subject.trim()) return true;
    if (toInput.trim() || ccInput.trim() || bccInput.trim()) return true;
    if (!arraysEqual(toEmails, b.toEmails)) return true;
    if (!arraysEqual(ccEmails, b.ccEmails)) return true;
    if (!arraysEqual(bccEmails, b.bccEmails)) return true;
    if (stripHtml(bodyHtml) !== stripHtml(b.bodyHtml)) return true;
    if (!attachmentsEqual(attachments, b.attachments)) return true;
    return false;
  }

  function closeComposeWithoutSave() {
    setComposeOpen(false);
    setComposeQuitOpen(false);
    setEditingDraftId(null);
    resetComposeRecipients();
    setSubject("");
    setBodyHtml("<p></p>");
    setAttachments([]);
  }

  async function deleteDraft(messageId: string) {
    const wasEditingThisDraft = editingDraftId === messageId;
    const res = await fetch(`/api/mail/${messageId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error(await parseMailApiError(res, "Could not delete draft"));
      return;
    }
    toast.success("Draft deleted");
    if (selectedMessageId === messageId) setSelectedMessageId(null);
    if (wasEditingThisDraft) closeComposeWithoutSave();
    await load();
  }

  function openDraftInComposer(m: Msg) {
    setEditingDraftId(m.id);
    setSelectedMessageId(null);
    resetComposeRecipients();
    const to: string[] = [];
    const cc: string[] = [];
    const bcc: string[] = [];
    for (const r of m.recipients ?? []) {
      const k = (r.kind ?? "TO") as "TO" | "CC" | "BCC";
      const email = r.email.trim().toLowerCase();
      if (!email) continue;
      if (k === "CC") cc.push(email);
      else if (k === "BCC") bcc.push(email);
      else to.push(email);
    }
    setToEmails(to);
    setCcEmails(cc);
    setBccEmails(bcc);
    setSubject(m.subject);
    setBodyHtml(m.body?.trim() ? m.body : "<p></p>");
    setAttachments(
      (m.attachments ?? []).map((a) => ({
        filename: a.filename,
        url: a.url,
        mimeType: a.mimeType,
        size: a.size,
      })),
    );
    setComposeSession((s) => s + 1);
    setComposeOpen(true);
  }

  function requestCloseCompose() {
    if (!isComposeDirty()) {
      closeComposeWithoutSave();
      return;
    }
    setComposeQuitOpen(true);
  }

  function composerBodyHasContent(html: string): boolean {
    if (/<img\s/i.test(html)) return true;
    return stripHtml(html).length > 0;
  }

  async function send(sendMail: boolean) {
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    if (sendMail) {
      if (toEmails.length + ccEmails.length + bccEmails.length === 0) {
        toast.error("Add at least one recipient in To, Cc, or Bcc to send");
        return;
      }
      if (!composerBodyHasContent(bodyHtml)) {
        toast.error("Add a message body to send");
        return;
      }
    }
    const res = await fetch("/api/mail", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(editingDraftId ? { id: editingDraftId } : {}),
        subject,
        body: bodyHtml ?? "",
        recipientEmails: toEmails,
        ccEmails,
        bccEmails,
        attachments,
        send: sendMail,
      }),
    });
    if (!res.ok) {
      toast.error(await parseMailApiError(res, "Could not save message"));
      return;
    }
    const sentPayload = (await res.json().catch(() => null)) as {
      mailDeliveryWarning?: string;
    } | null;
    if (sendMail && sentPayload?.mailDeliveryWarning) {
      toast.warning(
        `Saved in the portal, but email could not be sent: ${sentPayload.mailDeliveryWarning}`,
      );
    } else {
      toast.success(sendMail ? "Sent" : "Draft saved");
    }
    setComposeQuitOpen(false);
    closeComposeWithoutSave();
    await load();
  }

  async function markMessageUnread(messageId: string) {
    const res = await fetch(`/api/mail/${messageId}/unread`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      toast.error(await parseMailApiError(res, "Could not mark as unread"));
      return;
    }
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, viewerReadAt: null } : msg,
      ),
    );
    setInboxUnreadCount((n) => n + 1);
  }

  async function openMessage(m: Msg) {
    if (folder === "drafts") {
      openDraftInComposer(m);
      return;
    }
    if (folder === "inbox") {
      const wasUnread = m.viewerReadAt == null;
      await fetch(`/api/mail/${m.id}/read`, { method: "POST", credentials: "include" });
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === m.id
            ? { ...msg, viewerReadAt: new Date().toISOString() }
            : msg,
        ),
      );
      if (wasUnread) setInboxUnreadCount((n) => Math.max(0, n - 1));
    }
    setSelectedMessageId(m.id);
    if (me) {
      setReplyBodyHtml(`<p></p><hr /><p>${me.emailFooter.replace(/\n/g, "<br />")}</p>`);
      setReplyAttachments([]);
    }
  }

  useEffect(() => {
    if (!composeOpen) {
      setSuggestions([]);
      return;
    }
    const q = suggestQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        const res = await fetch(`/api/mail/suggestions?q=${encodeURIComponent(q)}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { suggestions: string[] };
        if (cancelled) return;
        const next = data.suggestions.filter((s) => !allComposeEmails.has(s));
        if (cancelled) return;
        setSuggestions(next);
      })();
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [suggestQuery, toEmails, ccEmails, bccEmails, composeOpen, allComposeEmails]);

  function addRecipient(field: "to" | "cc" | "bcc", emailRaw: string) {
    const email = emailRaw.trim().toLowerCase();
    if (!email) return;
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!valid) {
      toast.error("Enter a valid email address");
      return;
    }
    if (allComposeEmails.has(email)) {
      toast.error("That address is already in To, Cc, or Bcc");
      return;
    }
    if (field === "to") {
      setToEmails((prev) => [...prev, email]);
      setToInput("");
    } else if (field === "cc") {
      setCcEmails((prev) => [...prev, email]);
      setCcInput("");
    } else {
      setBccEmails((prev) => [...prev, email]);
      setBccInput("");
    }
  }

  async function attachReplyDocument(file: File) {
    const uploaded = await uploadFile(file);
    setReplyAttachments((prev) => [
      ...prev,
      {
        filename: uploaded.filename,
        url: uploaded.url,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
      },
    ]);
  }

  async function sendReply() {
    if (!selectedMessage || folder !== "inbox") return;
    const recipient = selectedMessage.sender?.internalEmail;
    if (!recipient) {
      toast.error("No sender to reply to");
      return;
    }
    const replySubject = selectedMessage.subject.toLowerCase().startsWith("re:")
      ? selectedMessage.subject
      : `Re: ${selectedMessage.subject}`;
    const res = await fetch("/api/mail", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        subject: replySubject,
        body: replyBodyHtml ?? "",
        recipientEmails: [recipient],
        attachments: replyAttachments,
        send: true,
      }),
    });
    if (!res.ok) {
      toast.error(await parseMailApiError(res, "Could not send reply"));
      return;
    }
    const replyPayload = (await res.json().catch(() => null)) as {
      mailDeliveryWarning?: string;
    } | null;
    if (replyPayload?.mailDeliveryWarning) {
      toast.warning(
        `Saved in the portal, but email could not be sent: ${replyPayload.mailDeliveryWarning}`,
      );
    } else {
      toast.success("Reply sent");
    }
    setReplyAttachments([]);
    setReplyBodyHtml(`<p></p><hr /><p>${me?.emailFooter.replace(/\n/g, "<br />") ?? ""}</p>`);
  }

  /** Fills the portal main column below the top bar (h-14), accounting for layout padding (p-4 / md:p-8). */
  const mailColumnMinHeight =
    "min-h-[calc(100dvh-3.5rem-2rem)] md:min-h-[calc(100dvh-3.5rem-4rem)]";

  return (
    <div
      className={cn(
        "relative flex flex-col",
        (composeOpen || isReadingMessage) && mailColumnMinHeight,
      )}
    >
    <div className={cn("space-y-6", (composeOpen || isReadingMessage) && "hidden")}>
      <div className="grid w-full grid-cols-1 md:grid-cols-[1fr_minmax(0,64rem)_1fr] md:gap-x-4">
        <div className="hidden md:col-start-1 md:row-start-1 md:block md:min-w-0" aria-hidden />
        <div className="col-start-1 mx-auto w-full min-w-0 max-w-5xl md:col-start-2 md:mx-0 md:w-full md:max-w-none">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Mail</h1>
              <p className="text-sm text-muted-foreground">
                Mail is stored in the portal. When SMTP is configured on the server, a copy is also sent
                from your 333mtrsprts.com domain to recipients&apos; mailboxes.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={() => void refreshMail()}
              >
                <RefreshCw className="size-4" aria-hidden />
                Refresh
              </Button>
              <Button
                disabled={!me}
                onClick={() => {
                  setEditingDraftId(null);
                  resetComposeRecipients();
                  setSubject("");
                  setAttachments([]);
                  setBodyHtml(
                    me
                      ? `<p></p><hr /><p>${me.emailFooter.replace(/\n/g, "<br />")}</p>`
                      : "<p></p>",
                  );
                  setComposeSession((s) => s + 1);
                  setComposeOpen(true);
                }}
              >
                Compose
              </Button>
            </div>
          </div>
        </div>
        <div className="hidden md:col-start-3 md:row-start-1 md:block md:min-w-0" aria-hidden />
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => {
          const id = String(e.active.id);
          const m = /^mail-(.+)$/.exec(id);
          setActiveMailDragId(m ? m[1] : null);
        }}
        onDragEnd={(e: DragEndEvent) => {
          setActiveMailDragId(null);
          handleMailDragEnd(e);
        }}
        onDragCancel={() => setActiveMailDragId(null)}
      >
        <div className="grid w-full grid-cols-1 gap-y-5 md:grid-cols-[1fr_minmax(0,64rem)_1fr] md:items-start md:gap-x-4">
          {folder === "inbox" ? (
            <aside
              className="mx-auto flex w-full max-w-5xl flex-col space-y-3 border-b border-border/60 pb-5 md:sticky md:top-4 md:col-start-1 md:mx-0 md:max-h-[calc(100dvh-8rem)] md:w-56 md:max-w-none md:justify-self-end md:self-start md:overflow-y-auto md:rounded-xl md:border md:border-border/50 md:bg-muted/15 md:p-3 md:pb-3"
              aria-label="Mail labels"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Tag className="size-3.5" aria-hidden />
                  Labels
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={mailLabels.length >= MAIL_LABEL_MAX_PER_USER}
                  onClick={() => setNewLabelOpen(true)}
                >
                  <Plus className="size-3.5" />
                  New
                </Button>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Use the grip on the left side of an email to drag emails into labels. Labels are used
                to help filter emails for easier navigation.
              </p>
              <button
                type="button"
                onClick={() => setSelectedFilterLabelIds([])}
                className={cn(
                  "w-full rounded-md border px-2 py-1.5 text-left text-sm transition-colors",
                  selectedFilterLabelIds.length === 0
                    ? "border-primary/40 bg-primary/10 font-medium"
                    : "border-transparent hover:bg-accent/60",
                )}
              >
                All mail
              </button>
              <div className="max-h-[min(40vh,20rem)] space-y-1 overflow-y-auto pr-0.5">
                {mailLabels.map((label) => (
                  <div key={label.id} className="flex items-stretch gap-0.5">
                    <div className="min-w-0 flex-1">
                      <MailLabelDropRow
                        label={label}
                        filterSelected={selectedFilterLabelIds.includes(label.id)}
                        onToggleFilter={() => toggleFilterLabel(label.id)}
                      />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        aria-label={`Label actions: ${label.name}`}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingLabel(label);
                            setEditLabelName(label.name);
                            setEditLabelColor(label.color);
                          }}
                        >
                          Edit name / color
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => void deleteMailLabel(label.id)}
                        >
                          Delete label
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
              {mailLabels.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No labels yet. Create one with New (max {MAIL_LABEL_MAX_PER_USER}).
                </p>
              )}
            </aside>
          ) : (
            <div className="hidden md:col-start-1 md:block md:min-w-0" aria-hidden />
          )}

          <div className="col-start-1 mx-auto w-full min-w-0 max-w-5xl md:col-start-2 md:mx-0 md:w-full md:max-w-none">
            <Tabs
              value={folder}
              onValueChange={(v) => setFolder(v as typeof folder)}
            >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="inbox" className="gap-1.5">
              <span>Inbox</span>
              {inboxUnreadCount > 0 ? (
                <span className="min-w-[1.25rem] rounded-full bg-primary/15 px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums leading-none text-primary">
                  {inboxUnreadCount}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="drafts">Drafts</TabsTrigger>
          </TabsList>
          <TabsList>
            <TabsTrigger value="trash">Trash</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value={folder} className="mt-4">
          {folder === "trash" && (
            <p className="mb-3 text-xs text-muted-foreground md:text-sm">
              Messages stay here for 30 days, then they are permanently deleted and cannot be
              recovered. Open a message and choose Undelete to move it back to your Inbox or Sent
              folder.
            </p>
          )}
          <div className="space-y-3">
              {folder === "inbox" && selectedFilterLabelIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Showing {listMessages.length} of {messages.length} — matching any selected label
                </p>
              )}
              {listMessages.map((m) => (
                <Card
                  key={m.id}
                  className={cn(
                    "cursor-pointer transition-[opacity,transform,background-color] duration-200 hover:bg-accent/30",
                    folder === "inbox" &&
                      activeMailDragId === m.id &&
                      "pointer-events-none scale-[0.995] opacity-25",
                  )}
                  onClick={() => void openMessage(m)}
                >
                  <CardHeader className="py-3">
                    <div className="flex gap-2">
                      <InboxDragHandle
                        messageId={m.id}
                        disabled={folder !== "inbox"}
                      />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex min-w-0 items-center gap-2">
                        {folder === "inbox" ? (
                          <>
                            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                              <CardTitle
                                className={cn(
                                  "min-w-0 truncate text-sm font-medium leading-tight",
                                  (m.viewerLabels?.length ?? 0) > 0
                                    ? "max-w-[min(20rem,48%)] shrink sm:max-w-[min(24rem,52%)]"
                                    : "flex-1",
                                )}
                              >
                                {m.subject}
                              </CardTitle>
                              {(m.viewerLabels?.length ?? 0) > 0 && (
                                <div
                                  className="flex min-w-0 flex-1 flex-wrap items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                  onPointerDown={(e) => e.stopPropagation()}
                                >
                                  {(m.viewerLabels ?? []).map((lb) => (
                                    <span
                                      key={lb.id}
                                      className="inline-flex max-w-[9.5rem] items-center gap-0.5 rounded-full border bg-background/90 px-[calc(0.375rem+0.5px)] py-[calc(0.125rem+0.5px)] text-[9px] text-foreground leading-none shadow-sm"
                                    >
                                      <span
                                        className="size-1 shrink-0 rounded-full"
                                        style={{ backgroundColor: lb.color }}
                                        aria-hidden
                                      />
                                      <span className="truncate">{lb.name}</span>
                                      <button
                                        type="button"
                                        className="rounded-full px-0.5 py-0 text-[10px] leading-none hover:bg-destructive/15"
                                        aria-label={`Remove label ${lb.name}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void removeLabelFromMessage(m.id, lb.id);
                                        }}
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <InboxReadStatus
                              viewerReadAt={m.viewerReadAt}
                              messageId={m.id}
                              size="list"
                              onMarkUnread={(id) => void markMessageUnread(id)}
                            />
                          </>
                        ) : (
                          <CardTitle className="min-w-0 flex-1 truncate text-sm font-medium leading-tight">
                            {m.subject}
                          </CardTitle>
                        )}
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                          {folder === "trash" && m.viewerTrashedAt
                            ? `In Trash · permanently removed after ${formatTrashPurgeDate(m.viewerTrashedAt)}`
                            : folder === "inbox" && m.sender
                              ? `From ${m.sender.name}`
                              : folder === "sent"
                                ? [
                                    formatNames(m.recipients, ["TO"]) &&
                                      `To ${formatNames(m.recipients, ["TO"])}`,
                                    formatNames(m.recipients, ["CC"]) &&
                                      `Cc ${formatNames(m.recipients, ["CC"])}`,
                                    formatNames(m.recipients, ["BCC"]) &&
                                      `Bcc ${formatNames(m.recipients, ["BCC"])}`,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "Recipients"
                                : "Draft"}
                          {m.sentAt && folder !== "trash"
                            ? ` · ${new Date(m.sentAt).toLocaleString()}`
                            : ""}
                        </p>
                        <div
                          className="flex shrink-0 items-center gap-1"
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          {folder === "inbox" && (
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              aria-label="Delete"
                              title="Delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                void trashMessage(m.id, "inbox");
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                          {folder === "sent" && (
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              aria-label="Delete"
                              title="Delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                void trashMessage(m.id, "sent");
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                          {folder === "trash" && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                void restoreFromTrash(m.id);
                              }}
                            >
                              Undelete
                            </Button>
                          )}
                          {folder === "drafts" && (
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              aria-label="Delete"
                              title="Delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deleteDraft(m.id);
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                          {folder !== "drafts" && folder !== "trash" && (
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="size-8"
                              aria-label="Forward"
                              title="Forward"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingDraftId(null);
                                resetComposeRecipients();
                                setAttachments([]);
                                setSubject(`Fwd: ${m.subject}`);
                                setBodyHtml(
                                  `<p></p><p>---------- Forwarded message ----------</p>${m.body}`,
                                );
                                setComposeSession((s) => s + 1);
                                setComposeOpen(true);
                              }}
                            >
                              <Forward className="size-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-3 text-xs text-muted-foreground line-clamp-2">
                    {stripHtml(m.body)}
                  </CardContent>
                </Card>
              ))}
              {listMessages.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {folder === "trash"
                    ? "Trash is empty."
                    : folder === "inbox" && selectedFilterLabelIds.length > 0
                      ? "No messages match these labels."
                      : "No messages."}
                </p>
              )}
          </div>
        </TabsContent>
      </Tabs>
          </div>
          <div className="hidden md:col-start-3 md:block md:min-w-0" aria-hidden />
        </div>
        <DragOverlay
          dropAnimation={{
            duration: 200,
            easing: "cubic-bezier(0.25, 1, 0.5, 1)",
          }}
          className="z-[200]"
        >
          {activeMailDragMessage ? (
            <div className="origin-top-left rotate-1 scale-[1.02]">
              <MailDragPreview message={activeMailDragMessage} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <Dialog open={newLabelOpen} onOpenChange={setNewLabelOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New label</DialogTitle>
            <DialogDescription>
              Up to {MAIL_LABEL_MAX_PER_USER} labels. Use the grip on the left side of an email to
              drag emails into labels.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-label-name">Name</Label>
              <Input
                id="new-label-name"
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                placeholder="e.g. Projects"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-label-color">Color</Label>
              <Input
                id="new-label-color"
                type="color"
                value={hexForColorInput(newLabelColor)}
                onChange={(e) => setNewLabelColor(e.target.value)}
                className="h-10 w-full cursor-pointer overflow-hidden p-0"
              />
            </div>
          </div>
          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setNewLabelOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void createMailLabel()}
              disabled={!newLabelName.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingLabel != null}
        onOpenChange={(open) => {
          if (!open) setEditingLabel(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit label</DialogTitle>
            <DialogDescription>Change the name or color. This updates all tagged messages.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-label-name">Name</Label>
              <Input
                id="edit-label-name"
                value={editLabelName}
                onChange={(e) => setEditLabelName(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-label-color">Color</Label>
              <Input
                id="edit-label-color"
                type="color"
                value={hexForColorInput(editLabelColor)}
                onChange={(e) => setEditLabelColor(e.target.value)}
                className="h-10 w-full cursor-pointer overflow-hidden p-0"
              />
            </div>
          </div>
          <DialogFooter className="border-0 bg-transparent p-0 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setEditingLabel(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveEditedMailLabel()}
              disabled={!editLabelName.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

    {isReadingMessage && selectedMessage && (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/80 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={() => setSelectedMessageId(null)}
          >
            <ArrowLeft className="mr-1 size-4" />
            Back
          </Button>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
                {selectedMessage.subject}
              </h2>
              {folder === "inbox" && (
                <InboxReadStatus
                  viewerReadAt={selectedMessage.viewerReadAt}
                  messageId={selectedMessage.id}
                  size="header"
                  onMarkUnread={(id) => void markMessageUnread(id)}
                />
              )}
            </div>
            {folder === "inbox" && (selectedMessage.viewerLabels?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1">
                {(selectedMessage.viewerLabels ?? []).map((lb) => (
                  <span
                    key={lb.id}
                    className="inline-flex max-w-[12rem] items-center gap-0.5 rounded-full border bg-muted/50 pl-2 pr-0.5 text-[11px]"
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: lb.color }}
                      aria-hidden
                    />
                    <span className="truncate">{lb.name}</span>
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-destructive/15"
                      aria-label={`Remove label ${lb.name}`}
                      onClick={() => void removeLabelFromMessage(selectedMessage.id, lb.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap gap-2">
            {folder === "drafts" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Delete"
                  title="Delete"
                  onClick={() => void deleteDraft(selectedMessage.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => {
                    openDraftInComposer(selectedMessage);
                  }}
                >
                  Continue editing
                </Button>
              </>
            ) : folder === "trash" ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => void restoreFromTrash(selectedMessage.id)}
              >
                Undelete
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Delete"
                  title="Delete"
                  onClick={() =>
                    void trashMessage(
                      selectedMessage.id,
                      folder === "inbox" ? "inbox" : "sent",
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9"
                  aria-label="Forward"
                  title="Forward"
                  onClick={() => {
                    setEditingDraftId(null);
                    resetComposeRecipients();
                    setAttachments([]);
                    setSubject(`Fwd: ${selectedMessage.subject}`);
                    setBodyHtml(
                      `<p></p><p>---------- Forwarded message ----------</p>${selectedMessage.body}`,
                    );
                    setComposeSession((s) => s + 1);
                    setSelectedMessageId(null);
                    setComposeOpen(true);
                  }}
                >
                  <Forward className="size-4" />
                </Button>
              </>
            )}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="w-full space-y-4 pb-16 md:space-y-6 md:pb-24">
            <div className="space-y-1 text-xs text-muted-foreground md:text-sm">
              {folder === "inbox" && selectedMessage.sender && (
                <p>
                  From {selectedMessage.sender.name} &lt;
                  {selectedMessage.sender.internalEmail}&gt;
                </p>
              )}
              {formatNames(selectedMessage.recipients, ["TO"]) && (
                <p>To: {formatNames(selectedMessage.recipients, ["TO"])}</p>
              )}
              {formatNames(selectedMessage.recipients, ["CC"]) && (
                <p>Cc: {formatNames(selectedMessage.recipients, ["CC"])}</p>
              )}
              {(folder === "sent" || folder === "drafts" || folder === "trash") &&
                formatNames(selectedMessage.recipients, ["BCC"]) && (
                  <p>Bcc: {formatNames(selectedMessage.recipients, ["BCC"])}</p>
                )}
              {folder === "inbox" &&
                formatNames(selectedMessage.recipients, ["BCC"]) && (
                  <p className="text-amber-800 dark:text-amber-300">
                    Bcc (visible to you):{" "}
                    {formatNames(selectedMessage.recipients, ["BCC"])}
                  </p>
                )}
              {folder === "drafts" && <p className="text-muted-foreground">Draft</p>}
              {folder === "trash" && selectedMessage.viewerTrashedAt && (
                <p className="text-muted-foreground">
                  In Trash · permanently removed after{" "}
                  {formatTrashPurgeDate(selectedMessage.viewerTrashedAt)}
                </p>
              )}
              {selectedMessage.sentAt && folder !== "trash" && (
                <p>{new Date(selectedMessage.sentAt).toLocaleString()}</p>
              )}
            </div>
            <div
              className="prose prose-sm max-w-none rounded-md border p-3 dark:prose-invert md:prose-base md:p-4"
              dangerouslySetInnerHTML={{ __html: selectedMessage.body }}
            />
            {(selectedMessage.attachments?.length ?? 0) > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Attachments</p>
                {selectedMessage.attachments?.map((a) => (
                  <a
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-sm underline"
                  >
                    {a.filename}
                  </a>
                ))}
              </div>
            )}

            {folder === "inbox" && selectedMessage.sender && (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-medium">Reply</p>
                <RichEditor
                  content={replyBodyHtml}
                  onChange={setReplyBodyHtml}
                  onUploadFile={async (file) => {
                    const uploaded = await uploadFile(file);
                    return { url: uploaded.url };
                  }}
                />
                <div className="space-y-2">
                  <Label htmlFor="reply-attach">Attach documents</Label>
                  <Input
                    id="reply-attach"
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      for (const file of files) {
                        void attachReplyDocument(file);
                      }
                      e.currentTarget.value = "";
                    }}
                  />
                </div>
                {replyAttachments.length > 0 && (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {replyAttachments.map((a) => (
                      <div
                        key={`${a.url}-${a.filename}`}
                        className="rounded border px-2 py-1"
                      >
                        {a.filename}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button onClick={() => void sendReply()}>Send reply</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {isReadingMessage && selectedMessageId && !selectedMessage && (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
        <p className="text-sm text-muted-foreground">This message could not be found.</p>
        <Button type="button" variant="outline" onClick={() => setSelectedMessageId(null)}>
          Back to mail
        </Button>
      </div>
    )}

    {composeOpen && (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border/80 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2"
            onClick={() => requestCloseCompose()}
          >
            <ArrowLeft className="mr-1 size-4" />
            Back
          </Button>
          <h2 className="text-lg font-semibold tracking-tight">
            {editingDraftId ? "Edit draft" : "New message"}
          </h2>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={() => closeComposeWithoutSave()}
            >
              {editingDraftId ? "Discard changes" : "Discard"}
            </Button>
            <Button type="button" variant="outline" onClick={() => void send(false)}>
              Save draft
            </Button>
            <Button type="button" onClick={() => void send(true)}>
              Send
            </Button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="w-full space-y-4 pb-16 md:space-y-5 md:pb-24">
            <div className="space-y-2">
              <Label>To</Label>
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    placeholder="Type an email and press Enter"
                    value={toInput}
                    onChange={(e) => setToInput(e.target.value)}
                    onFocus={() => setRecipientFocus("to")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRecipient("to", toInput);
                      }
                    }}
                  />
                  <InlineRecipientSuggestions
                    show={recipientFocus === "to"}
                    suggestions={recipientFocus === "to" ? suggestions : []}
                    onPick={(s) => addRecipient("to", s)}
                  />
                </div>
                {toEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {toEmails.map((email) => (
                      <button
                        key={email}
                        type="button"
                        className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
                        onClick={() =>
                          setToEmails((prev) => prev.filter((x) => x !== email))
                        }
                        title="Remove recipient"
                      >
                        {email} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-3">
              <div className="space-y-2">
                <Label>Cc</Label>
                <div className="relative">
                  <Input
                    placeholder="Optional — carbon copy"
                    value={ccInput}
                    onChange={(e) => setCcInput(e.target.value)}
                    onFocus={() => setRecipientFocus("cc")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRecipient("cc", ccInput);
                      }
                    }}
                  />
                  <InlineRecipientSuggestions
                    show={recipientFocus === "cc"}
                    suggestions={recipientFocus === "cc" ? suggestions : []}
                    onPick={(s) => addRecipient("cc", s)}
                  />
                </div>
                {ccEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {ccEmails.map((email) => (
                      <button
                        key={email}
                        type="button"
                        className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
                        onClick={() =>
                          setCcEmails((prev) => prev.filter((x) => x !== email))
                        }
                        title="Remove"
                      >
                        {email} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Bcc</Label>
                <div className="relative">
                  <Input
                    placeholder="Optional — hidden from other recipients"
                    value={bccInput}
                    onChange={(e) => setBccInput(e.target.value)}
                    onFocus={() => setRecipientFocus("bcc")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRecipient("bcc", bccInput);
                      }
                    }}
                  />
                  <InlineRecipientSuggestions
                    show={recipientFocus === "bcc"}
                    suggestions={recipientFocus === "bcc" ? suggestions : []}
                    onPick={(s) => addRecipient("bcc", s)}
                  />
                </div>
                {bccEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {bccEmails.map((email) => (
                      <button
                        key={email}
                        type="button"
                        className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
                        onClick={() =>
                          setBccEmails((prev) => prev.filter((x) => x !== email))
                        }
                        title="Remove"
                      >
                        {email} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subj">Subject</Label>
              <Input
                id="subj"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="text-base md:text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <div className="min-h-[280px] rounded-md border bg-card p-2 md:min-h-[360px] md:p-3">
                <RichEditor
                  content={bodyHtml}
                  onChange={setBodyHtml}
                  onUploadFile={async (file) => {
                    const uploaded = await uploadFile(file);
                    return { url: uploaded.url };
                  }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mail-attach">Attach documents</Label>
              <Input
                id="mail-attach"
                type="file"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  for (const file of files) {
                    void attachDocument(file);
                  }
                  e.currentTarget.value = "";
                }}
              />
              {attachments.length > 0 && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  {attachments.map((a) => (
                    <div key={`${a.url}-${a.filename}`} className="rounded border px-2 py-1">
                      {a.filename}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {composeQuitOpen && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="compose-quit-title"
          >
            <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-6 shadow-lg ring-1 ring-foreground/10">
              <h3 id="compose-quit-title" className="font-heading text-base font-medium">
                {editingDraftId ? "Discard unsaved changes?" : "Discard this message?"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {editingDraftId
                  ? "Save as draft to keep your edits, or discard changes and go back. The last saved version stays in Drafts until you save again."
                  : "You have unsaved changes. Save as draft to keep it in Drafts, or discard to delete this message and go back."}
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    setComposeQuitOpen(false);
                    void send(false);
                  }}
                >
                  Save as draft
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={() => closeComposeWithoutSave()}
                >
                  {editingDraftId ? "Discard changes" : "Discard"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setComposeQuitOpen(false)}
                >
                  Keep editing
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )}
    </div>
  );
}

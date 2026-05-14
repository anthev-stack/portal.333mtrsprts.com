import type { RecipientKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const RK: { TO: RecipientKind; CC: RecipientKind; BCC: RecipientKind } = {
  TO: "TO",
  CC: "CC",
  BCC: "BCC",
};

export function resendApiKey(): string {
  return (
    process.env.RESEND_API_KEY ??
    process.env.SMTP_PASS ??
    process.env.SMTP_PASSWORD ??
    ""
  ).trim();
}

/** Strip angle brackets and whitespace for Message-ID / In-Reply-To matching. */
export function normalizeMessageId(raw: string): string {
  return raw.replace(/^<|>$/g, "").trim();
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Best-effort strip dangerous tags from inbound HTML before storing/displaying. */
export function sanitizeInboundHtml(html: string): string {
  let s = html;
  s = s.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return s;
}

export function parseFromHeader(from: string): { name: string; email: string } {
  const trimmed = from.trim();
  const m = /^(.+?)\s*<([^>]+)>$/.exec(trimmed);
  if (m) {
    const name = m[1].replace(/^["']|["']$/g, "").trim();
    return { name: name || m[2].trim(), email: m[2].trim().toLowerCase() };
  }
  const email = trimmed.replace(/[<>]/g, "").trim().toLowerCase();
  const local = email.split("@")[0] ?? "Unknown";
  return { name: local, email };
}

function extractMailbox(raw: string): string | null {
  const t = raw.trim();
  const m = /<([^>]+)>/.exec(t);
  const inner = m ? m[1] : t;
  const e = inner.replace(/[<>]/g, "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

function getHeader(
  headers: Record<string, string | string[] | undefined> | null | undefined,
  key: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      if (Array.isArray(v)) return v[0];
      return typeof v === "string" ? v : undefined;
    }
  }
  return undefined;
}

export type ResendReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string | null;
  text?: string | null;
  message_id?: string;
  headers?: Record<string, string | string[] | undefined>;
};

export async function fetchResendReceivedEmail(emailId: string): Promise<ResendReceivedEmail | null> {
  const key = resendApiKey();
  if (!key) {
    console.error("[resend inbound] missing RESEND_API_KEY / SMTP_PASS");
    return null;
  }
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.error("[resend inbound] fetch received email failed", res.status, await res.text());
    return null;
  }
  return (await res.json()) as ResendReceivedEmail;
}

/**
 * Creates an InternalMessage from a Resend received email for portal users on To/Cc/Bcc.
 * Idempotent on `inboundResendId`. Attachments are not imported in this version.
 */
export async function processResendInboundEmail(emailId: string): Promise<{ ok: boolean; skipped?: string }> {
  const existing = await prisma.internalMessage.findFirst({
    where: { inboundResendId: emailId },
    select: { id: true },
  });
  if (existing) return { ok: true, skipped: "duplicate" };

  const data = await fetchResendReceivedEmail(emailId);
  if (!data) {
    console.error("[resend inbound] fetch_failed for emailId", emailId);
    return { ok: false, skipped: "fetch_failed" };
  }

  const fromParsed = parseFromHeader(data.from);

  type Pending = { email: string; kind: RecipientKind };
  const byEmail = new Map<string, Pending>();

  const consider = (addrs: string[] | undefined, kind: RecipientKind) => {
    for (const raw of addrs ?? []) {
      const email = extractMailbox(raw);
      if (!email || byEmail.has(email)) continue;
      byEmail.set(email, { email, kind });
    }
  };

  consider(data.to, RK.TO);
  consider(data.cc, RK.CC);
  consider(data.bcc, RK.BCC);

  const emails = [...byEmail.keys()];
  if (emails.length === 0) {
    console.warn("[resend inbound] no_recipients parsed from to/cc/bcc", {
      emailId,
      rawTo: data.to,
      rawCc: data.cc,
      rawBcc: data.bcc,
    });
    return { ok: true, skipped: "no_recipients" };
  }

  const users = await prisma.user.findMany({
    where: { internalEmail: { in: emails, mode: "insensitive" } },
    select: { id: true, internalEmail: true },
  });
  const userByLower = new Map(users.map((u) => [u.internalEmail.toLowerCase(), u]));

  const recipientCreates: { email: string; kind: RecipientKind; userId: string }[] = [];
  for (const [, row] of byEmail) {
    const u = userByLower.get(row.email);
    if (!u) continue;
    recipientCreates.push({
      email: u.internalEmail.toLowerCase(),
      kind: row.kind,
      userId: u.id,
    });
  }

  if (recipientCreates.length === 0) {
    console.warn(
      "[resend inbound] no_portal_recipients — To/Cc/Bcc did not match any User.internalEmail (case-insensitive)",
      { emailId, recipientAddresses: emails },
    );
    return { ok: true, skipped: "no_portal_recipients" };
  }

  let bodyHtml = "";
  if (data.html && data.html.trim()) {
    bodyHtml = sanitizeInboundHtml(data.html);
  } else if (data.text && data.text.trim()) {
    bodyHtml = `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtmlText(data.text)}</pre>`;
  } else {
    bodyHtml = "<p></p>";
  }

  let threadRootId: string | null = null;
  const inReplyTo = getHeader(data.headers as Record<string, string | string[] | undefined>, "in-reply-to");
  if (inReplyTo) {
    const mid = normalizeMessageId(inReplyTo);
    const parent = await prisma.internalMessage.findFirst({
      where: { rfcMessageId: mid },
      select: { id: true, threadRootId: true },
    });
    if (parent) {
      threadRootId = parent.threadRootId ?? parent.id;
    }
  }

  const rfcId = data.message_id ? normalizeMessageId(data.message_id) : null;

  const message = await prisma.internalMessage.create({
    data: {
      subject: (data.subject ?? "").trim() || "(No subject)",
      body: bodyHtml,
      status: "SENT",
      senderId: null,
      externalFromName: fromParsed.name,
      externalFromEmail: fromParsed.email,
      sentAt: new Date(),
      inboundResendId: emailId,
      rfcMessageId: rfcId,
      threadRootId,
      includeInSenderSent: true,
      recipients: {
        create: recipientCreates.map((r) => ({
          email: r.email,
          kind: r.kind,
          userId: r.userId,
        })),
      },
    },
    select: { id: true },
  });

  const notifyIds = [...new Set(recipientCreates.map((r) => r.userId))];
  if (notifyIds.length > 0) {
    await prisma.notification.createMany({
      data: notifyIds.map((userId) => ({
        userId,
        type: "mail",
        title: `You've received an email from ${fromParsed.name}`,
        body: `${fromParsed.email} · ${(data.subject ?? "").trim() || "(No subject)"}`,
        link: "/mail",
      })),
    });
  }

  console.info("[resend inbound] created InternalMessage", {
    messageId: message.id,
    emailId,
    portalRecipientCount: recipientCreates.length,
  });
  return { ok: true };
}

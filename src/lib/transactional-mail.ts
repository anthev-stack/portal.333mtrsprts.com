import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";

function smtpPassword(): string {
  return (process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD ?? "").trim();
}

/** True when SMTP credentials are set. `MAIL_FROM` defaults to noreply@333mtrsprts.com if omitted. */
export function isMailOutboundEnabled(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      smtpPassword(),
  );
}

function mailFromAddress(): string {
  return (
    process.env.MAIL_FROM?.trim() ??
    '333 Motorsports <noreply@333mtrsprts.com>'
  );
}

function createTransport() {
  const port = Number(process.env.SMTP_PORT ?? "587");
  const secure =
    process.env.SMTP_SECURE === "1" ||
    process.env.SMTP_SECURE === "true" ||
    port === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: smtpPassword(),
    },
  });
}

export type PortalMailRecipient = {
  email: string;
  kind: "TO" | "CC" | "BCC";
  user?: { internalEmail: string; externalEmail: string };
};

/** Where to deliver for portal users: their real inbox (external) or @domain mailbox (internal). */
function resolveSmtpRecipient(
  composeEmail: string,
  user?: { internalEmail: string; externalEmail: string },
): string {
  const lower = composeEmail.toLowerCase().trim();
  if (!user) return lower;
  const target = (process.env.MAIL_DELIVERY_TARGET ?? "external").toLowerCase();
  if (target === "internal") {
    return user.internalEmail.toLowerCase().trim();
  }
  const ext = user.externalEmail?.trim();
  if (ext) return ext.toLowerCase();
  return user.internalEmail.toLowerCase().trim();
}

function publicUrlToAbsoluteFile(publicPath: string): string | null {
  const rel = publicPath.replace(/^\/+/, "");
  if (!rel || rel.includes("..") || !rel.startsWith("uploads/")) return null;
  const disk = path.join(process.cwd(), "public", rel);
  const pubRoot = path.join(process.cwd(), "public");
  if (path.resolve(disk) !== path.resolve(path.join(pubRoot, rel))) return null;
  return disk;
}

/**
 * Sends one SMTP copy of a portal message (To/Cc/Bcc match the composer).
 * Skips entirely when SMTP is not configured (portal-only mode).
 */
export async function deliverInternalMessageCopy(params: {
  subject: string;
  html: string;
  senderName: string;
  senderInternalEmail: string;
  recipients: PortalMailRecipient[];
  attachments: { filename: string; url: string; mimeType?: string | null }[];
}): Promise<null | { ok: true } | { ok: false; error: string }> {
  if (!isMailOutboundEnabled()) return null;

  const toRaw: string[] = [];
  const ccRaw: string[] = [];
  const bccRaw: string[] = [];
  for (const r of params.recipients) {
    const addr = resolveSmtpRecipient(r.email, r.user);
    if (r.kind === "TO") toRaw.push(addr);
    else if (r.kind === "CC") ccRaw.push(addr);
    else bccRaw.push(addr);
  }

  const to = [...new Set(toRaw)];
  const cc = [...new Set(ccRaw)];
  const bcc = [...new Set(bccRaw)];

  if (to.length === 0 && cc.length === 0 && bcc.length === 0) {
    return { ok: true };
  }

  const nodemailerAttachments: {
    filename: string;
    path: string;
    contentType?: string;
  }[] = [];
  for (const a of params.attachments) {
    const disk = publicUrlToAbsoluteFile(a.url);
    if (disk && fs.existsSync(disk)) {
      nodemailerAttachments.push({
        filename: a.filename,
        path: disk,
        contentType: a.mimeType ?? undefined,
      });
    } else {
      console.warn("[mail outbound] attachment missing on disk, skipping:", a.url);
    }
  }

  const replyTo =
    process.env.MAIL_REPLY_TO_SENDER === "0" || process.env.MAIL_REPLY_TO_SENDER === "false"
      ? undefined
      : `${params.senderName} <${params.senderInternalEmail}>`;

  let toHeader = to.join(", ");
  let ccHeader = cc.length ? cc.join(", ") : undefined;
  const bccHeader = bcc.length ? bcc.join(", ") : undefined;

  if (!toHeader && cc.length > 0) {
    toHeader = cc[0]!;
    ccHeader = cc.slice(1).join(", ") || undefined;
  }
  if (!toHeader && bcc.length > 0) {
    toHeader = "undisclosed-recipients:;";
  }

  try {
    const transporter = createTransport();
    await transporter.sendMail({
      from: mailFromAddress(),
      replyTo,
      to: toHeader,
      cc: ccHeader,
      bcc: bccHeader,
      subject: params.subject,
      html: params.html,
    });
    return { ok: true };
  } catch (e) {
    console.error("[mail outbound] sendMail failed:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Email delivery failed",
    };
  }
}

export async function sendTransactionalHtml(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<null | { ok: true } | { ok: false; error: string }> {
  if (!isMailOutboundEnabled()) return null;
  try {
    const transporter = createTransport();
    await transporter.sendMail({
      from: mailFromAddress(),
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    return { ok: true };
  } catch (e) {
    console.error("[transactional mail] send failed:", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Email delivery failed",
    };
  }
}

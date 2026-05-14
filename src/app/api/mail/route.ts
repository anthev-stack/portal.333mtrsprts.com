import { NextResponse } from "next/server";
import { z } from "zod";
import type { MessageStatus, RecipientKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { countInboxUnreadForUser } from "@/lib/mail-inbox-unread";
import { normalizeReplySubject } from "@/lib/mail-subject";
import { deliverInternalMessageCopy } from "@/lib/transactional-mail";

/** Prisma enum values as literals — avoids runtime `undefined` from `RecipientKind` / `MessageStatus` imports under Turbopack. */
const ST: { DRAFT: MessageStatus; SENT: MessageStatus } = {
  DRAFT: "DRAFT",
  SENT: "SENT",
};
const RK: { TO: RecipientKind; CC: RecipientKind; BCC: RecipientKind } = {
  TO: "TO",
  CC: "CC",
  BCC: "BCC",
};

const folderSchema = z.enum(["inbox", "sent", "drafts", "trash"]);

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

async function purgeMailTrashPastRetention(): Promise<void> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);
  await prisma.$transaction([
    prisma.internalMessageRecipient.deleteMany({
      where: { trashedAt: { not: null, lt: cutoff } },
    }),
    prisma.internalMessage.deleteMany({
      where: {
        status: ST.SENT,
        senderTrashedAt: { not: null, lt: cutoff },
      },
    }),
  ]);
}

const emailArray = z
  .union([z.array(z.string()), z.null(), z.undefined()])
  .transform((v) =>
    [...new Set((v ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean))],
  )
  .pipe(z.array(z.string().email()));

function bodyHasContent(html: string): boolean {
  if (/<img\s/i.test(html)) return true;
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 0;
}

const postSchema = z
  .object({
    id: z.string().optional(),
    subject: z.string().trim().min(1, "Subject required"),
    body: z.preprocess(
      (v) => (typeof v === "string" ? v : ""),
      z.string(),
    ),
    recipientEmails: emailArray.default([]),
    ccEmails: emailArray.default([]),
    bccEmails: emailArray.default([]),
    attachments: z
      .array(
        z.object({
          filename: z.string().min(1),
          url: z.string().min(1),
          mimeType: z.string().nullable().optional(),
          size: z.number().int().nullable().optional(),
        }),
      )
      .nullish()
      .transform((v) => v ?? []),
    send: z.boolean().optional().default(false),
    /** When sending, links this message as a reply (threaded; omitted from sender Sent). */
    inReplyToMessageId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.inReplyToMessageId && !data.send) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cannot save a reply as draft with this endpoint",
        path: ["inReplyToMessageId"],
      });
    }
    const recipientCount =
      data.recipientEmails.length +
      data.ccEmails.length +
      data.bccEmails.length;
    if (data.send && recipientCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add at least one recipient in To, Cc, or Bcc to send",
        path: ["recipientEmails"],
      });
    }
    if (data.send && !bodyHasContent(data.body)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add a message body to send",
        path: ["body"],
      });
    }
  });

function mergeRecipientRows(
  to: string[],
  cc: string[],
  bcc: string[],
): { email: string; kind: RecipientKind }[] {
  const rank: Record<string, number> = {};
  const apply = (emails: string[], kind: RecipientKind) => {
    const r = kind === RK.TO ? 0 : kind === RK.CC ? 1 : 2;
    for (const e of emails) {
      const cur = rank[e];
      if (cur === undefined || r < cur) rank[e] = r;
    }
  };
  apply(bcc, RK.BCC);
  apply(cc, RK.CC);
  apply(to, RK.TO);
  const kindForRank = (n: number): RecipientKind =>
    n === 0 ? RK.TO : n === 1 ? RK.CC : RK.BCC;
  return Object.entries(rank).map(([email, r]) => ({
    email,
    kind: kindForRank(r),
  }));
}

function filterRecipientsForViewer<
  T extends { email: string; kind: RecipientKind; userId: string | null },
>(recipients: T[], viewer: { id: string; internalEmail: string }, viewerIsSender: boolean): T[] {
  if (viewerIsSender) return recipients;
  const my = viewer.internalEmail.toLowerCase();
  return recipients.filter((r) => {
    if (r.kind === RK.BCC) {
      return r.userId === viewer.id || r.email.toLowerCase() === my;
    }
    return true;
  });
}

function withFooter(body: string, footer: string | null | undefined): string {
  const cleanedFooter = footer?.trim();
  if (!cleanedFooter) return body;
  // Client composer / reply pre-inserts the footer as HTML (<br />, <hr />). Plain `includes(footer)` misses that and duplicates.
  const footerAsHtml = cleanedFooter.replace(/\n/g, "<br />");
  const footerVariants = [
    cleanedFooter,
    footerAsHtml,
    cleanedFooter.replace(/\n/g, "<br>"),
    cleanedFooter.replace(/\n/g, "<br/>"),
  ];
  for (const fragment of footerVariants) {
    if (fragment && body.includes(fragment)) return body;
  }
  const collapsed = body.replace(/\s+/g, " ");
  const collapsedFooter = footerAsHtml.replace(/\s+/g, " ");
  if (collapsedFooter.length >= 8 && collapsed.includes(collapsedFooter)) return body;
  return `${body}\n\n<hr />\n<p>${footerAsHtml}</p>`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const folder = folderSchema.safeParse(searchParams.get("folder") ?? "inbox");
  if (!folder.success) {
    return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
  }

  const includeInboxUnread = searchParams.get("inboxUnread") === "1";

  await purgeMailTrashPastRetention();

  const recipientInclude = {
    include: { user: { select: { id: true, name: true, internalEmail: true } } },
  } as const;

  const recipientIncludeInbox = {
    include: {
      user: { select: { id: true, name: true, internalEmail: true } },
      mailLabels: { include: { label: true } },
    },
  } as const;

  if (folder.data === "drafts") {
    const drafts = await prisma.internalMessage.findMany({
      where: { senderId: session.id, status: ST.DRAFT },
      orderBy: { updatedAt: "desc" },
      include: {
        recipients: recipientInclude,
        attachments: true,
      },
    });
    const inboxUnreadCount = includeInboxUnread
      ? await countInboxUnreadForUser(session)
      : undefined;
    return NextResponse.json(
      inboxUnreadCount !== undefined
        ? { messages: drafts, inboxUnreadCount }
        : { messages: drafts },
    );
  }

  if (folder.data === "sent") {
    const sent = await prisma.internalMessage.findMany({
      where: {
        senderId: session.id,
        status: ST.SENT,
        senderTrashedAt: null,
        includeInSenderSent: true,
      },
      orderBy: { sentAt: "desc" },
      include: {
        recipients: recipientInclude,
        attachments: true,
      },
    });
    const inboxUnreadCount = includeInboxUnread
      ? await countInboxUnreadForUser(session)
      : undefined;
    return NextResponse.json(
      inboxUnreadCount !== undefined
        ? { messages: sent, inboxUnreadCount }
        : { messages: sent },
    );
  }

  if (folder.data === "trash") {
    const trashedAsRecipient = await prisma.internalMessage.findMany({
      where: {
        status: ST.SENT,
        recipients: {
          some: {
            trashedAt: { not: null },
            OR: [
              { userId: session.id },
              { email: { equals: session.internalEmail, mode: "insensitive" } },
            ],
          },
        },
      },
      orderBy: { sentAt: "desc" },
      include: {
        sender: { select: { id: true, name: true, internalEmail: true, imageUrl: true } },
        recipients: recipientInclude,
        attachments: true,
      },
    });

    const trashedAsSender = await prisma.internalMessage.findMany({
      where: {
        senderId: session.id,
        status: ST.SENT,
        senderTrashedAt: { not: null },
      },
      orderBy: { sentAt: "desc" },
      include: {
        sender: { select: { id: true, name: true, internalEmail: true, imageUrl: true } },
        recipients: recipientInclude,
        attachments: true,
      },
    });

    const merged = new Map<
      string,
      { message: (typeof trashedAsRecipient)[0]; earliestTrash: Date }
    >();
    const myEmail = session.internalEmail.toLowerCase();

    for (const m of trashedAsRecipient) {
      const row = m.recipients.find(
        (r) => r.userId === session.id || r.email.toLowerCase() === myEmail,
      );
      if (!row?.trashedAt) continue;
      const prev = merged.get(m.id);
      if (!prev || row.trashedAt < prev.earliestTrash) {
        merged.set(m.id, { message: m, earliestTrash: row.trashedAt });
      }
    }

    for (const m of trashedAsSender) {
      if (!m.senderTrashedAt) continue;
      const prev = merged.get(m.id);
      if (!prev) {
        merged.set(m.id, { message: m, earliestTrash: m.senderTrashedAt });
      } else {
        const earliest =
          m.senderTrashedAt < prev.earliestTrash ? m.senderTrashedAt : prev.earliestTrash;
        merged.set(m.id, { message: prev.message, earliestTrash: earliest });
      }
    }

    const messages = [...merged.values()]
      .sort((a, b) => b.earliestTrash.getTime() - a.earliestTrash.getTime())
      .map(({ message: m, earliestTrash }) => {
        const myRow = m.recipients.find(
          (r) => r.userId === session.id || r.email.toLowerCase() === myEmail,
        );
        return {
          ...m,
          recipients: filterRecipientsForViewer(
            m.recipients,
            { id: session.id, internalEmail: session.internalEmail },
            m.senderId === session.id,
          ),
          viewerReadAt: myRow?.readAt ?? null,
          viewerTrashedAt: earliestTrash.toISOString(),
        };
      });

    const inboxUnreadCount = includeInboxUnread
      ? await countInboxUnreadForUser(session)
      : undefined;
    return NextResponse.json(
      inboxUnreadCount !== undefined
        ? { messages, inboxUnreadCount }
        : { messages },
    );
  }

  const inboxWhere = {
    status: ST.SENT,
    OR: [
      {
        recipients: {
          some: {
            archived: false,
            trashedAt: null,
            OR: [
              { userId: session.id },
              { email: { equals: session.internalEmail, mode: "insensitive" as const } },
            ],
          },
        },
      },
      {
        senderId: session.id,
        senderTrashedAt: null,
        includeInSenderSent: false,
        threadRootId: { not: null },
      },
    ],
  };

  const inboxIncludeBase = {
    sender: { select: { id: true, name: true, internalEmail: true, imageUrl: true } },
    attachments: true,
  } as const;

  const inbox = await (async () => {
    try {
      return await prisma.internalMessage.findMany({
        where: inboxWhere,
        orderBy: { sentAt: "desc" },
        include: {
          ...inboxIncludeBase,
          recipients: recipientIncludeInbox,
        },
      });
    } catch (e) {
      console.error("mail GET inbox (with label relations) failed, retrying without labels:", e);
      return prisma.internalMessage.findMany({
        where: inboxWhere,
        orderBy: { sentAt: "desc" },
        include: {
          ...inboxIncludeBase,
          recipients: recipientInclude,
        },
      });
    }
  })();

    const messages = inbox.map((m) => {
      const myRow = m.recipients.find(
        (r) =>
          r.userId === session.id ||
          r.email.toLowerCase() === session.internalEmail.toLowerCase(),
      );
      const viewerIsSenderOnly =
        m.senderId === session.id && !myRow && m.includeInSenderSent === false;
      const rowWithLabels = myRow as
        | (typeof myRow & {
            mailLabels?: { label: { id: string; name: string; color: string } }[];
          })
        | undefined;
      return {
        ...m,
        recipients: filterRecipientsForViewer(
          m.recipients,
          { id: session.id, internalEmail: session.internalEmail },
          m.senderId === session.id,
        ),
        viewerReadAt: viewerIsSenderOnly
          ? new Date().toISOString()
          : (myRow?.readAt ?? null),
        viewerLabels: (rowWithLabels?.mailLabels ?? []).map((ml) => ({
          id: ml.label.id,
          name: ml.label.name,
          color: ml.label.color,
        })),
      };
    });

  const inboxUnreadCount = includeInboxUnread
    ? await countInboxUnreadForUser(session)
    : undefined;
  return NextResponse.json(
    inboxUnreadCount !== undefined
      ? { messages, inboxUnreadCount }
      : { messages },
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.flatten();
    const hint = [
      ...(first.fieldErrors.subject ?? []),
      ...(first.fieldErrors.body ?? []),
      ...(first.fieldErrors.recipientEmails ?? []),
      ...(first.fieldErrors.ccEmails ?? []),
      ...(first.fieldErrors.bccEmails ?? []),
      ...(first.fieldErrors.attachments ?? []),
      ...(first.fieldErrors.id ?? []),
      ...(first.fieldErrors.send ?? []),
      ...(first.fieldErrors.inReplyToMessageId ?? []),
      ...(first.formErrors),
    ][0];
    const issueMsg = parsed.error.issues[0]?.message;
    return NextResponse.json(
      { error: hint ?? issueMsg ?? "Invalid request" },
      { status: 400 },
    );
  }

  const { subject, body, recipientEmails, ccEmails, bccEmails, send } = parsed.data;
  const attachments = parsed.data.attachments;
  const inReplyToId = parsed.data.inReplyToMessageId;

  try {
    let finalSubject = subject;
    let threadMeta: { threadRootId: string; includeInSenderSent: boolean } | null = null;

    if (send && inReplyToId && !parsed.data.id) {
      const parent = await prisma.internalMessage.findFirst({
        where: { id: inReplyToId, status: ST.SENT },
        include: { recipients: true },
      });
      if (!parent) {
        return NextResponse.json({ error: "Message to reply to not found" }, { status: 404 });
      }
      const my = session.internalEmail.toLowerCase();
      const amRecipient = parent.recipients.some(
        (r) => r.userId === session.id || r.email.toLowerCase() === my,
      );
      const amSenderInThread =
        parent.senderId === session.id && parent.threadRootId != null;
      if (!amRecipient && !amSenderInThread) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const rootId = parent.threadRootId ?? parent.id;
      threadMeta = { threadRootId: rootId, includeInSenderSent: false };
      finalSubject = normalizeReplySubject(parent.subject);
    }

    const sender = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        emailFooter: true,
        name: true,
        internalEmail: true,
      },
    });
    if (!sender) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bodyWithFooter = withFooter(body, sender.emailFooter);

    const merged = mergeRecipientRows(recipientEmails, ccEmails, bccEmails);
    const allEmails = merged.map((r) => r.email);

    const directoryMatches =
      allEmails.length === 0
        ? []
        : await prisma.user.findMany({
            where: { internalEmail: { in: allEmails, mode: "insensitive" } },
            select: {
              id: true,
              name: true,
              internalEmail: true,
              externalEmail: true,
              awayModeEnabled: true,
              awayModeTemplate: true,
              emailFooter: true,
            },
          });
    const userByEmail = new Map(
      directoryMatches.map((r) => [r.internalEmail.toLowerCase(), r]),
    );

    const recipientCreates =
      merged.length > 0
        ? merged.map(({ email, kind }) => {
            const user = userByEmail.get(email);
            return {
              email,
              kind,
              userId: user?.id ?? null,
            };
          })
        : undefined;

    const attachmentCreates =
      attachments.length > 0
        ? attachments.map((a) => ({
            filename: a.filename,
            url: a.url,
            mimeType: a.mimeType ?? null,
            size: a.size ?? null,
          }))
        : undefined;

    const notifyUsers = [
      ...new Map(
        merged
          .map((row) => {
            const u = userByEmail.get(row.email);
            return u ? ([u.id, u] as const) : null;
          })
          .filter((x): x is [string, (typeof directoryMatches)[0]] => x !== null),
      ).values(),
    ];

    const tryOutboundCopy = async (): Promise<string | undefined> => {
      if (!send || merged.length === 0) return undefined;
      const outbound = await deliverInternalMessageCopy({
        subject: finalSubject,
        html: bodyWithFooter,
        senderName: sender.name,
        senderInternalEmail: sender.internalEmail,
        recipients: merged.map(({ email, kind }) => ({
          email,
          kind: kind === RK.TO ? "TO" : kind === RK.CC ? "CC" : "BCC",
          user: (() => {
            const u = userByEmail.get(email);
            return u
              ? {
                  internalEmail: u.internalEmail,
                  externalEmail: u.externalEmail,
                }
              : undefined;
          })(),
        })),
        attachments,
      });
      if (outbound && !outbound.ok) return outbound.error;
      return undefined;
    };

    if (parsed.data.id) {
      const existing = await prisma.internalMessage.findFirst({
        where: {
          id: parsed.data.id,
          senderId: session.id,
          status: ST.DRAFT,
        },
      });
      if (!existing) {
        return NextResponse.json({ error: "Draft not found" }, { status: 404 });
      }

      await prisma.internalMessageRecipient.deleteMany({
        where: { messageId: existing.id },
      });
      await prisma.attachment.deleteMany({
        where: { messageId: existing.id },
      });

      const updated = await prisma.internalMessage.update({
        where: { id: existing.id },
        data: {
          subject,
          body: bodyWithFooter,
          status: send ? ST.SENT : ST.DRAFT,
          sentAt: send ? new Date() : null,
          ...(recipientCreates
            ? { recipients: { create: recipientCreates } }
            : {}),
          ...(attachmentCreates
            ? { attachments: { create: attachmentCreates } }
            : {}),
        },
        include: {
          recipients: {
            include: { user: { select: { id: true, name: true, internalEmail: true } } },
          },
          attachments: true,
        },
      });

      if (send && notifyUsers.length > 0) {
        await prisma.notification.createMany({
          data: notifyUsers
            .filter((u) => u.id !== session.id)
            .map((u) => ({
              userId: u.id,
              type: "mail",
              title: `You've received an email from ${sender.name}`,
              body: `${sender.internalEmail} · ${finalSubject}`,
              link: "/mail",
            })),
        });
        const awayRecipients = notifyUsers.filter(
          (r) => r.awayModeEnabled && r.id !== session.id,
        );
        for (const away of awayRecipients) {
          const autoReplyBody = withFooter(
            away.awayModeTemplate?.trim() ||
              "Thanks for your message. I am currently away and will respond when I return.",
            away.emailFooter,
          );
          await prisma.internalMessage.create({
            data: {
              subject: `Automatic reply: ${finalSubject}`,
              body: autoReplyBody,
              senderId: away.id,
              status: ST.SENT,
              sentAt: new Date(),
              recipients: {
                create: [
                  {
                    userId: session.id,
                    email: session.internalEmail.toLowerCase(),
                    kind: RK.TO,
                  },
                ],
              },
            },
          });
          await prisma.notification.create({
            data: {
              userId: session.id,
              type: "mail_auto_reply",
              title: `You've received an email from ${away.name}`,
              body: away.internalEmail,
              link: "/mail",
            },
          });
        }
      }

      const mailDeliveryWarning = send ? await tryOutboundCopy() : undefined;
      return NextResponse.json(
        mailDeliveryWarning
          ? { message: updated, mailDeliveryWarning }
          : { message: updated },
      );
    }

    const message = await prisma.internalMessage.create({
      data: {
        subject: finalSubject,
        body: bodyWithFooter,
        senderId: session.id,
        status: send ? ST.SENT : ST.DRAFT,
        sentAt: send ? new Date() : null,
        ...(threadMeta
          ? {
              threadRootId: threadMeta.threadRootId,
              includeInSenderSent: threadMeta.includeInSenderSent,
            }
          : {}),
        ...(recipientCreates ? { recipients: { create: recipientCreates } } : {}),
        ...(attachmentCreates
          ? { attachments: { create: attachmentCreates } }
          : {}),
      },
      include: {
        recipients: {
          include: { user: { select: { id: true, name: true, internalEmail: true } } },
        },
        attachments: true,
      },
    });

    if (send && notifyUsers.length > 0) {
      await prisma.notification.createMany({
        data: notifyUsers
          .filter((u) => u.id !== session.id)
          .map((u) => ({
            userId: u.id,
            type: "mail",
            title: `You've received an email from ${sender.name}`,
            body: `${sender.internalEmail} · ${finalSubject}`,
            link: "/mail",
          })),
      });
      const awayRecipients = notifyUsers.filter(
        (r) => r.awayModeEnabled && r.id !== session.id,
      );
      for (const away of awayRecipients) {
        const autoReplyBody = withFooter(
          away.awayModeTemplate?.trim() ||
            "Thanks for your message. I am currently away and will respond when I return.",
          away.emailFooter,
        );
        await prisma.internalMessage.create({
          data: {
            subject: `Automatic reply: ${finalSubject}`,
            body: autoReplyBody,
            senderId: away.id,
            status: ST.SENT,
            sentAt: new Date(),
            recipients: {
              create: [
                {
                  userId: session.id,
                  email: session.internalEmail.toLowerCase(),
                  kind: RK.TO,
                },
              ],
            },
          },
        });
        await prisma.notification.create({
          data: {
            userId: session.id,
            type: "mail_auto_reply",
            title: `You've received an email from ${away.name}`,
            body: away.internalEmail,
            link: "/mail",
          },
        });
      }
    }

    const mailDeliveryWarning = send ? await tryOutboundCopy() : undefined;
    return NextResponse.json(
      mailDeliveryWarning ? { message, mailDeliveryWarning } : { message },
    );
  } catch (e) {
    console.error("mail POST", e);
    return NextResponse.json(
      { error: "Could not save message. Try again or contact an administrator." },
      { status: 500 },
    );
  }
}

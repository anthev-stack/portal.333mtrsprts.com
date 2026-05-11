import type { MessageStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PORTAL_MAIL_UNREAD_COUNT_EVENT = "portal-mail-unread-count" as const;

const ST_SENT: MessageStatus = "SENT";

/** Inbox messages for this user with no read timestamp (matches mail folder=inbox logic). */
export async function countInboxUnreadForUser(session: {
  id: string;
  internalEmail: string;
}): Promise<number> {
  return prisma.internalMessage.count({
    where: {
      status: ST_SENT,
      recipients: {
        some: {
          archived: false,
          trashedAt: null,
          readAt: null,
          OR: [
            { userId: session.id },
            { email: { equals: session.internalEmail, mode: "insensitive" } },
          ],
        },
      },
    },
  });
}

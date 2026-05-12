import { prisma } from "@/lib/prisma";
import { countInboxUnreadForUser } from "@/lib/mail-inbox-unread";

/** Dispatched when combined sidebar badge counts should refresh. */
export const PORTAL_SIDEBAR_COUNTS_EVENT = "portal-sidebar-counts" as const;

export type PortalSidebarCountsPayload = {
  mail: number;
  jobs: number;
  home: number;
  knowledgebase: number;
  customerCare: number;
};

export async function getPortalSidebarCountsForUser(session: {
  id: string;
  internalEmail: string;
}): Promise<PortalSidebarCountsPayload> {
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { lastSeenHomeFeedAt: true, lastSeenKnowledgebaseAt: true },
  });
  if (!user) {
    return { mail: 0, jobs: 0, home: 0, knowledgebase: 0, customerCare: 0 };
  }

  const [
    mail,
    jobs,
    homePosts,
    homeComments,
    knowledgebase,
    customerCare,
  ] = await Promise.all([
    countInboxUnreadForUser(session),
    prisma.jobAssignment.count({
      where: {
        userId: session.id,
        status: { notIn: ["COMPLETED", "WAIVED"] },
        job: { archivedAt: null, isReminder: false },
      },
    }),
    prisma.post.count({
      where: {
        authorId: { not: session.id },
        createdAt: { gt: user.lastSeenHomeFeedAt },
      },
    }),
    prisma.postComment.count({
      where: {
        createdAt: { gt: user.lastSeenHomeFeedAt },
        authorId: { not: session.id },
        post: { authorId: session.id },
      },
    }),
    prisma.knowledgeArticle.count({
      where: {
        published: true,
        updatedAt: { gt: user.lastSeenKnowledgebaseAt },
      },
    }),
    prisma.customerCareRequest.count({
      where: {
        resolvedAt: null,
        assignments: { some: { userId: session.id } },
      },
    }),
  ]);

  return {
    mail,
    jobs,
    home: homePosts + homeComments,
    knowledgebase,
    customerCare,
  };
}

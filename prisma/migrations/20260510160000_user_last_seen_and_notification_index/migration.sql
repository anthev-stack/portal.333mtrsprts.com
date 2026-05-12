-- Track when the user last opened Home / Knowledgebase for sidebar "new" badges.
ALTER TABLE "User" ADD COLUMN "lastSeenHomeFeedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ADD COLUMN "lastSeenKnowledgebaseAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

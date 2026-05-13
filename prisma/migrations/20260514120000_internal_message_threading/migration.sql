-- Threading: replies share threadRootId; replies omit sender Sent when includeInSenderSent = false.
ALTER TABLE "InternalMessage" ADD COLUMN "threadRootId" TEXT;
ALTER TABLE "InternalMessage" ADD COLUMN "includeInSenderSent" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "InternalMessage" ADD CONSTRAINT "InternalMessage_threadRootId_fkey" FOREIGN KEY ("threadRootId") REFERENCES "InternalMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InternalMessage_threadRootId_idx" ON "InternalMessage"("threadRootId");

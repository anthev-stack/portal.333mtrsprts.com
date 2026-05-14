-- Inbound internet mail: optional sender FK, external From fields, Resend id dedupe, Message-ID for threading.
ALTER TABLE "InternalMessage" DROP CONSTRAINT "InternalMessage_senderId_fkey";

ALTER TABLE "InternalMessage" ALTER COLUMN "senderId" DROP NOT NULL;

ALTER TABLE "InternalMessage" ADD COLUMN "externalFromName" TEXT;
ALTER TABLE "InternalMessage" ADD COLUMN "externalFromEmail" TEXT;
ALTER TABLE "InternalMessage" ADD COLUMN "inboundResendId" TEXT;
ALTER TABLE "InternalMessage" ADD COLUMN "rfcMessageId" TEXT;

CREATE UNIQUE INDEX "InternalMessage_inboundResendId_key" ON "InternalMessage"("inboundResendId");

CREATE INDEX "InternalMessage_rfcMessageId_idx" ON "InternalMessage"("rfcMessageId");

ALTER TABLE "InternalMessage" ADD CONSTRAINT "InternalMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

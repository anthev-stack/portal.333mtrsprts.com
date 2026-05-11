-- AlterTable
ALTER TABLE "InternalMessage" ADD COLUMN "senderTrashedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InternalMessageRecipient" ADD COLUMN "trashedAt" TIMESTAMP(3);

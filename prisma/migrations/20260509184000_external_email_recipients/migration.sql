-- DropForeignKey
ALTER TABLE "InternalMessageRecipient" DROP CONSTRAINT "InternalMessageRecipient_userId_fkey";

-- DropIndex
DROP INDEX "InternalMessageRecipient_messageId_userId_key";

-- AlterTable
ALTER TABLE "InternalMessageRecipient" ADD COLUMN "email" TEXT;

UPDATE "InternalMessageRecipient" r
SET "email" = u."internalEmail"
FROM "User" u
WHERE r."userId" = u."id";

UPDATE "InternalMessageRecipient"
SET "email" = CONCAT('unknown+', "id", '@local.invalid')
WHERE "email" IS NULL;

ALTER TABLE "InternalMessageRecipient"
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "InternalMessageRecipient_messageId_email_key" ON "InternalMessageRecipient"("messageId", "email");

-- AddForeignKey
ALTER TABLE "InternalMessageRecipient" ADD CONSTRAINT "InternalMessageRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
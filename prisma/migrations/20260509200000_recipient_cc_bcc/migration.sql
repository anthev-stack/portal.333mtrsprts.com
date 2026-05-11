-- CreateEnum
CREATE TYPE "RecipientKind" AS ENUM ('TO', 'CC', 'BCC');

-- AlterTable
ALTER TABLE "InternalMessageRecipient" ADD COLUMN "kind" "RecipientKind" NOT NULL DEFAULT 'TO';

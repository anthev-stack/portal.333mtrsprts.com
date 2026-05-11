-- AlterTable
ALTER TABLE "User" ADD COLUMN     "awayModeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "awayModeTemplate" TEXT,
ADD COLUMN     "emailFooter" TEXT NOT NULL DEFAULT 'Best regards,
333 MOTORSPORTS';
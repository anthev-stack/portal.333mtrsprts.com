-- CreateEnum
CREATE TYPE "ScheduledJobFrequency" AS ENUM ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "scheduledJobId" TEXT;

-- CreateTable
CREATE TABLE "ScheduledJob" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "assignToEveryone" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "ScheduledJobFrequency" NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledJobAssignee" (
    "scheduledJobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ScheduledJobAssignee_pkey" PRIMARY KEY ("scheduledJobId","userId")
);

-- CreateIndex
CREATE INDEX "Job_scheduledJobId_idx" ON "Job"("scheduledJobId");

-- CreateIndex
CREATE INDEX "ScheduledJob_isActive_nextRunAt_idx" ON "ScheduledJob"("isActive", "nextRunAt");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_scheduledJobId_fkey" FOREIGN KEY ("scheduledJobId") REFERENCES "ScheduledJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledJob" ADD CONSTRAINT "ScheduledJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledJobAssignee" ADD CONSTRAINT "ScheduledJobAssignee_scheduledJobId_fkey" FOREIGN KEY ("scheduledJobId") REFERENCES "ScheduledJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledJobAssignee" ADD CONSTRAINT "ScheduledJobAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

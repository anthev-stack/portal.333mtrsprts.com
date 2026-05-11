-- AlterEnum: add WAIVED for "assign to everyone" jobs when another assignee claimed the work
ALTER TYPE "JobAssignmentStatus" ADD VALUE 'WAIVED';

-- Admin can reject "all done" work and send the job back with a note for assignees
ALTER TABLE "Job" ADD COLUMN "adminRejectionReason" TEXT;

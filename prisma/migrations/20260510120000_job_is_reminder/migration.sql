-- Personal reminder jobs: excluded from org progress metrics and open-count badge
ALTER TABLE "Job" ADD COLUMN "isReminder" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Job" AS j
SET "isReminder" = true
FROM "JobAssignment" AS a
WHERE a."jobId" = j."id"
  AND j."assignToEveryone" = false
  AND a."userId" = j."createdById"
  AND (SELECT COUNT(*)::int FROM "JobAssignment" AS c WHERE c."jobId" = j."id") = 1;

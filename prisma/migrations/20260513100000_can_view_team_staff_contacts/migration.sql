-- Replace "expose this user's contact" with "this user may view everyone's staff contact on Team"
ALTER TABLE "User" DROP COLUMN IF EXISTS "teamStaffContactVisible";
ALTER TABLE "User" ADD COLUMN "canViewTeamStaffContacts" BOOLEAN NOT NULL DEFAULT false;

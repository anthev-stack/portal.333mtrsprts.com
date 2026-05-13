-- Team directory: intro blurp, card order, optional contact visibility on Team tab
ALTER TABLE "User" ADD COLUMN "profileBlurp" VARCHAR(600);
ALTER TABLE "User" ADD COLUMN "teamDirectorySortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "teamStaffContactVisible" BOOLEAN NOT NULL DEFAULT false;

-- Stable initial order (existing accounts)
WITH numbered AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY "createdAt", "name") - 1) AS rn
  FROM "User"
)
UPDATE "User" u
SET "teamDirectorySortOrder" = n.rn
FROM numbered n
WHERE u.id = n.id;

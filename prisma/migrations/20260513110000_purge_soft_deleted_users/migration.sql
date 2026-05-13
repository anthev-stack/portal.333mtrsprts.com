-- Legacy soft-deleted rows: delete is now a hard remove only; pause covers temporary access blocks.
DELETE FROM "User" WHERE "accountStatus" = 'DELETED';

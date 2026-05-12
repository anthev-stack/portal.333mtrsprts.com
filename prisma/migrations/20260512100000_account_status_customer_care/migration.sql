-- Account lifecycle (admin)
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DELETED');

ALTER TABLE "User" ADD COLUMN "accountStatus" "AccountStatus" NOT NULL DEFAULT 'ACTIVE';

-- Customer care (phonebook-style logging + multi-assign)
CREATE TABLE "CustomerCareRequest" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "query" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCareRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerCareAssignment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCareAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerCareAssignment_requestId_userId_key" ON "CustomerCareAssignment"("requestId", "userId");

CREATE INDEX "CustomerCareRequest_createdById_idx" ON "CustomerCareRequest"("createdById");
CREATE INDEX "CustomerCareRequest_resolvedAt_idx" ON "CustomerCareRequest"("resolvedAt");
CREATE INDEX "CustomerCareAssignment_userId_idx" ON "CustomerCareAssignment"("userId");
CREATE INDEX "CustomerCareAssignment_requestId_idx" ON "CustomerCareAssignment"("requestId");

ALTER TABLE "CustomerCareRequest" ADD CONSTRAINT "CustomerCareRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerCareAssignment" ADD CONSTRAINT "CustomerCareAssignment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CustomerCareRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerCareAssignment" ADD CONSTRAINT "CustomerCareAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

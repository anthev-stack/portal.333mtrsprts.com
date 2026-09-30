-- CreateEnum
CREATE TYPE "ProductSuggestionStatus" AS ENUM ('NEW', 'REVIEWING', 'CONTACTED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ProductSuggestion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "productName" TEXT,
    "description" TEXT NOT NULL,
    "extraNotes" TEXT,
    "shopifyCustomerId" TEXT,
    "photoUrl" TEXT,
    "photoFilename" TEXT,
    "status" "ProductSuggestionStatus" NOT NULL DEFAULT 'NEW',
    "staffNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSuggestion_status_idx" ON "ProductSuggestion"("status");

-- CreateIndex
CREATE INDEX "ProductSuggestion_createdAt_idx" ON "ProductSuggestion"("createdAt");

-- CreateIndex
CREATE INDEX "ProductSuggestion_email_idx" ON "ProductSuggestion"("email");

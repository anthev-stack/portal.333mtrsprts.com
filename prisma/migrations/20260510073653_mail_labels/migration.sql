-- CreateTable
CREATE TABLE "MailLabel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailRecipientLabel" (
    "recipientId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "MailRecipientLabel_pkey" PRIMARY KEY ("recipientId","labelId")
);

-- CreateIndex
CREATE INDEX "MailLabel_userId_idx" ON "MailLabel"("userId");

-- CreateIndex
CREATE INDEX "MailRecipientLabel_labelId_idx" ON "MailRecipientLabel"("labelId");

-- AddForeignKey
ALTER TABLE "MailLabel" ADD CONSTRAINT "MailLabel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailRecipientLabel" ADD CONSTRAINT "MailRecipientLabel_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "InternalMessageRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailRecipientLabel" ADD CONSTRAINT "MailRecipientLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "MailLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

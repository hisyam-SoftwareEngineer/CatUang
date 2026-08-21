-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PROCESSING', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'ERROR');

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "parsedData" JSONB,
    "providerUsed" TEXT,
    "transactionId" TEXT,
    "imageUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_businessId_idx" ON "ImportBatch"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatchItem_transactionId_key" ON "ImportBatchItem"("transactionId");

-- CreateIndex
CREATE INDEX "ImportBatchItem_batchId_idx" ON "ImportBatchItem"("batchId");

-- CreateIndex
CREATE INDEX "ImportBatchItem_status_idx" ON "ImportBatchItem"("status");

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatchItem" ADD CONSTRAINT "ImportBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatchItem" ADD CONSTRAINT "ImportBatchItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

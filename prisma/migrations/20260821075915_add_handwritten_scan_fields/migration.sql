-- CreateEnum
CREATE TYPE "InputType" AS ENUM ('RECEIPT', 'HANDWRITTEN');

-- AlterTable
ALTER TABLE "ImportBatchItem" ADD COLUMN     "confidence" DOUBLE PRECISION,
ADD COLUMN     "inputType" "InputType" NOT NULL DEFAULT 'RECEIPT',
ADD COLUMN     "parsedItems" JSONB,
ADD COLUMN     "rawOcrText" TEXT;

-- CreateIndex
CREATE INDEX "ImportBatchItem_inputType_idx" ON "ImportBatchItem"("inputType");

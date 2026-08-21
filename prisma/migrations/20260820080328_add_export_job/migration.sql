-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'PROCESSING',
    "reportType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "downloadUrl" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExportJob_businessId_idx" ON "ExportJob"("businessId");

-- CreateIndex
CREATE INDEX "ExportJob_userId_idx" ON "ExportJob"("userId");

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

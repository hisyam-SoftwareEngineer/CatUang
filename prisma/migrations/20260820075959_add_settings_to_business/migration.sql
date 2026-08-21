-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "defaultExportFormat" TEXT NOT NULL DEFAULT 'PDF',
ADD COLUMN     "defaultPdfTemplate" TEXT NOT NULL DEFAULT 'SIMPLE',
ADD COLUMN     "enableMultiCurrency" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ocrProviderEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ocrProviderPriority" TEXT NOT NULL DEFAULT 'MINDEE,AZURE',
ADD COLUMN     "ocrQuotaThresholdPercent" INTEGER NOT NULL DEFAULT 80,
ADD COLUMN     "realtimeSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "waLinked" BOOLEAN NOT NULL DEFAULT false;

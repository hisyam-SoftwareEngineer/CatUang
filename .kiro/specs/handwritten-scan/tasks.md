# Implementation Plan: Handwritten Scan (Pindai Tulisan Tangan)

## Overview

Fitur ini adalah ekstensi dari modul `ocr-processing` yang sudah ada. Implementasi dilakukan secara incremental: mulai dari fondasi (skema + interface), lalu provider OCR baru, kemudian quota management, hingga update controller/service/worker yang menyatukan semuanya.

Bahasa implementasi: **TypeScript (NestJS)**. Semua uang menggunakan `Decimal`, bukan `Float`/`Number`.

---

## Tasks

- [x] 1. Migrasi Skema Database

  - [x] 1.1 Tambah enum `InputType` dan 4 field baru ke `ImportBatchItem` di `prisma/schema.prisma`
    - Tambah `enum InputType { RECEIPT, HANDWRITTEN }` ke schema
    - Tambah field ke `ImportBatchItem`: `inputType InputType @default(RECEIPT)`, `parsedItems Json?`, `confidence Float?`, `rawOcrText String?`
    - Tambah `@@index([inputType])` ke model `ImportBatchItem`
    - Pastikan field `parsedData` yang sudah ada tidak diubah (backward compatibility)
    - Jalankan `prisma migrate dev --name add_handwritten_scan_fields`
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [ ]* 1.2 Verifikasi migration tidak merusak data existing
    - Tulis test yang memastikan `ImportBatchItem` lama (tanpa field baru) masih bisa dibaca dengan `inputType` default `RECEIPT`
    - _Requirements: 10.7_

- [x] 2. Perluasan Interface dan Tipe OCR

  - [x] 2.1 Perluas `ocr-provider.interface.ts` dengan tipe-tipe baru
    - Tambah interface `ParsedLineItem` dengan field: `description`, `amount`, `type`, `date`, `confidence`
    - Perluas `NormalizedReceiptResult` dengan field: `items?: ParsedLineItem[]`, `rawOcrText?: string`, `overallConfidence?: number`
    - Update signature `OcrProvider.extractReceipt()` agar menerima parameter `inputType: InputType`
    - Tambah property `supportedInputTypes: InputType[]` ke interface `OcrProvider`
    - _Requirements: 11.1, 5.2_

  - [x] 2.2 Update provider existing agar kompatibel dengan interface baru
    - Update `MindeeOcrProvider`, `AzureOcrProvider`, `DummyOcrProvider`: tambah `supportedInputTypes: [InputType.RECEIPT]` dan update signature `extractReceipt()` agar menerima `inputType`
    - Provider existing tetap mengabaikan parameter `inputType` (hanya untuk kompatibilitas)
    - _Requirements: 3.2_

- [x] 3. Tambah Env Variables Baru ke Zod Schema

  - [x] 3.1 Update `src/config/env.schema.ts` dengan env var provider baru
    - Tambah ke Zod schema: `GEMINI_API_KEY: z.string().optional()`, `GOOGLE_CLOUD_VISION_API_KEY: z.string().optional()`, `TESSERACT_LANG: z.string().default('ind+eng')`
    - Tambah juga `GOOGLE_APPLICATION_CREDENTIALS: z.string().optional()` sebagai alternatif service account GCV
    - _Requirements: 8.4_

- [x] 4. Implementasi GeminiOcrProvider

  - [x] 4.1 Buat `src/modules/ocr-processing/providers/gemini-ocr.provider.ts`
    - Install dependency: `@google/generative-ai@^0.21.0`
    - Implementasi `GeminiOcrProvider implements OcrProvider` dengan `supportedInputTypes: [InputType.HANDWRITTEN, InputType.RECEIPT]`
    - Encode gambar ke base64 dan kirim ke Gemini 1.5 Flash dengan system prompt terstruktur (lihat design Section 3.3)
    - Parse JSON response Gemini menjadi `NormalizedReceiptResult` — jika JSON tidak valid, return `confidence: 0` tanpa throw exception
    - Implementasi `isRateLimited(businessId: string): Promise<boolean>` menggunakan `RedisService` dengan key `quota:gemini:rpm:{businessId}`, window 60 detik, threshold 12 request
    - Inject `RedisService` dan `ConfigService` via constructor
    - Gunakan `isConfigured` getter: return `true` jika `GEMINI_API_KEY` tersedia
    - _Requirements: 3.1, 4.1, 4.2, 8.3, 8.4_

  - [ ]* 4.2 Tulis unit test untuk `GeminiOcrProvider`
    - **Property 2: Amount hasil OCR selalu positif** — generate arbitrary ParsedLineItem, validasi `amount > 0`
    - **Memvalidasi: Requirements 9.1**
    - Test happy path: mock Gemini SDK return JSON valid → `NormalizedReceiptResult` terstruktur
    - Test JSON malformed dari Gemini → return `confidence: 0`, tidak throw
    - Test `isRateLimited()` return `true` saat counter Redis ≥ 12
    - _Requirements: 4.1, 4.2, 8.3_

- [x] 5. Implementasi GoogleVisionOcrProvider

  - [x] 5.1 Buat `src/modules/ocr-processing/providers/google-vision-ocr.provider.ts`
    - Install dependency: `@google-cloud/vision@^4.3.2`
    - Implementasi `GoogleVisionOcrProvider implements OcrProvider` dengan `supportedInputTypes: [InputType.HANDWRITTEN, InputType.RECEIPT]`
    - Gunakan `TEXT_DETECTION` feature GCV API dengan autentikasi via `GOOGLE_CLOUD_VISION_API_KEY` atau `GOOGLE_APPLICATION_CREDENTIALS`
    - Parse blok teks raw menggunakan heuristik (regex deteksi angka Rupiah, kata kunci `masuk`/`keluar`/`beli`/`jual`) menjadi `ParsedLineItem[]`
    - Implementasi `isQuotaExhausted(): Promise<boolean>` menggunakan `RedisService` dengan key `quota:gcv:monthly:{YYYY-MM}`, threshold 800 unit
    - Gunakan `isConfigured` getter: return `true` jika `GOOGLE_CLOUD_VISION_API_KEY` atau `GOOGLE_APPLICATION_CREDENTIALS` tersedia
    - _Requirements: 3.1, 4.3, 4.4, 4.6_

  - [ ]* 5.2 Tulis unit test untuk `GoogleVisionOcrProvider`
    - **Property 3: Tanggal yang diparsing tidak melebihi 24 jam ke depan** — generate arbitrary date, validasi filter
    - **Memvalidasi: Requirements 9.2, 6.8**
    - Test `isQuotaExhausted()` return `true` saat counter Redis ≥ 800
    - Test parsing heuristik: teks dengan angka Rupiah → `ParsedLineItem[]` benar
    - _Requirements: 4.3, 4.4_

- [x] 6. Implementasi TesseractOcrProvider

  - [x] 6.1 Buat `src/modules/ocr-processing/providers/tesseract-ocr.provider.ts`
    - Install dependency: `tesseract.js@^5.1.1`
    - Implementasi `TesseractOcrProvider implements OcrProvider` dengan `supportedInputTypes: [InputType.HANDWRITTEN, InputType.RECEIPT]`
    - Jalankan Tesseract dengan `lang=ind+eng` (dari env `TESSERACT_LANG`) dan pre-processing grayscale sebelum OCR untuk meningkatkan akurasi
    - Parse output teks menggunakan regex untuk mengekstrak angka Rupiah dan deskripsi transaksi
    - Set `confidence` antara 0.3–0.5 sebagai sinyal ke UI bahwa hasil ini butuh review ketat
    - Provider ini selalu `isConfigured = true` (tidak butuh API key), tidak ada quota check
    - _Requirements: 3.1, 4.5_

  - [ ]* 6.2 Tulis unit test untuk `TesseractOcrProvider`
    - Test bahwa `isConfigured` selalu `true`
    - Test output confidence selalu dalam range 0.3–0.5
    - Test graceful handling saat gambar kosong atau corrupt
    - _Requirements: 4.5_

- [x] 7. Update `OcrProviderFactory` untuk Routing Berdasarkan `inputType`

  - [x] 7.1 Perbarui `ocr-provider.factory.ts` dengan method `getProvidersForInputType()`
    - Tambah method `getProvidersForInputType(inputType: InputType): OcrProvider[]`
    - Untuk `InputType.HANDWRITTEN`: return chain `[GeminiOcrProvider, GoogleVisionOcrProvider, TesseractOcrProvider]` — hanya provider yang `isConfigured = true` yang dimasukkan, Tesseract selalu ada sebagai last resort
    - Untuk `InputType.RECEIPT`: return chain existing `[MindeeOcrProvider, AzureOcrProvider, DummyOcrProvider]` tanpa perubahan
    - Inject ketiga provider baru via constructor NestJS DI
    - Pertahankan method `getProviders()` yang sudah ada agar tidak breaking
    - _Requirements: 3.1, 3.2_

  - [ ]* 7.2 Tulis unit test untuk `OcrProviderFactory`
    - **Property 7: Provider yang melebihi quota tidak dipanggil dalam chain** — mock `isRateLimited()`/`isQuotaExhausted()` return true, verifikasi provider tidak masuk chain
    - **Memvalidasi: Requirements 4.1, 4.3, 4.6**
    - Test routing: `getProvidersForInputType(HANDWRITTEN)` → chain Gemini/GCV/Tesseract
    - Test routing: `getProvidersForInputType(RECEIPT)` → chain Mindee/Azure/Dummy
    - Test provider tidak dikonfigurasi (key tidak ada) tidak masuk chain
    - _Requirements: 3.1, 3.2, 4.1, 4.3, 4.6_

- [x] 8. Update `OcrWorker` untuk Field Baru dan Routing `inputType`

  - [x] 8.1 Perbarui `ocr.worker.ts` untuk menerima `inputType` dan menyimpan field baru
    - Update signature job data: `{ itemId: string; imageUrl: string; inputType: InputType }`
    - Ganti `providerFactory.getProviders()` dengan `providerFactory.getProvidersForInputType(inputType)`
    - Setelah provider berhasil, simpan `parsedItems`, `confidence`, `rawOcrText`, dan `providerUsed` ke `ImportBatchItem`
    - Implementasi validasi `ParsedLineItem` sebelum simpan ke DB: filter item dengan `amount <= 0` (set `confidence: 0`), nullkan `date` yang melebihi 24 jam dari waktu pemrosesan
    - Konfigurasi BullMQ: `concurrency: 3`, `timeout: 60000` (60 detik), retry 3x dengan backoff 1s/5s/25s
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 9.1, 9.2, 9.3, 9.4_

  - [ ]* 8.2 Tulis unit test untuk logika validasi `ParsedLineItem` di `OcrWorker`
    - **Property 2: Amount hasil OCR selalu positif** — test worker menolak item dengan `amount <= 0`
    - **Memvalidasi: Requirements 9.1**
    - **Property 3: Tanggal tidak melebihi 24 jam ke depan** — test worker menullkan tanggal future
    - **Memvalidasi: Requirements 9.2**
    - Test seluruh provider gagal → status `ERROR` dengan pesan yang benar
    - Test concurrency settings sudah terkonfigurasi
    - _Requirements: 3.3, 3.4, 3.5, 9.1, 9.2_

- [x] 9. Checkpoint — Pastikan Semua Test Pass
  - Pastikan semua unit test berjalan tanpa error, tanya user jika ada pertanyaan.

- [x] 10. Update Upload DTO dan Rate Limiter

  - [x] 10.1 Buat `src/modules/ocr-processing/dto/upload-import.dto.ts` dan implementasi rate limiter upload
    - Buat `UploadImportDto` dengan field opsional `@IsOptional() @IsEnum(InputType) inputType?: InputType = InputType.RECEIPT`
    - Buat `UploadRateLimiterGuard` atau implementasi inline di controller: cek Redis key `rate:upload:{businessId}` dengan window 60 detik, maksimum 10 request — return HTTP 429 jika melebihi
    - _Requirements: 1.1, 1.2, 1.7, 11.1_

- [x] 11. Update `ApproveImportDto` untuk Multi-Item

  - [x] 11.1 Perluas `approve-import.dto.ts` dengan `selectedItems` untuk alur handwritten
    - Buat `ApproveLineItemDto` dengan field wajib: `description` (string non-kosong), `amount` (string via `@IsPositiveDecimal()`), `type` (`TransactionType`), `occurredAt` (ISO 8601), `accountId` (UUID), `currency` (string)
    - Tambah field opsional ke `ApproveLineItemDto`: `categoryId` (UUID)
    - Perluas `ApproveImportDto` dengan field opsional: `@IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ApproveLineItemDto) selectedItems?: ApproveLineItemDto[]`
    - Pertahankan semua field existing `ApproveImportDto` (backward compatible)
    - _Requirements: 6.1, 11.3, 11.4, 11.5_

- [x] 12. Update `OcrProcessingService` untuk Fitur Baru

  - [x] 12.1 Perbarui `processImportRequest()` untuk menerima dan meneruskan `inputType`
    - Tambah parameter `inputType: InputType = InputType.RECEIPT` ke signature method
    - Simpan `inputType` ke `ImportBatchItem` saat `CREATE`
    - Teruskan `inputType` ke BullMQ job data: `{ itemId, imageUrl, inputType }`
    - _Requirements: 1.1, 1.2, 3.1_

  - [x] 12.2 Perbarui `approveImport()` untuk handle `selectedItems` (multi-item)
    - Jika `dto.selectedItems` tersedia dan tidak kosong: iterasi setiap item dalam satu `prisma.$transaction()`, buat satu `Transaction` per item via `TransactionService.createTransaction()`, update `ImportBatchItem.status = APPROVED` dan simpan `transactionId` terakhir
    - Validasi setiap item sebelum eksekusi: `amount > 0` (throw `INVALID_AMOUNT`), `occurredAt` tidak lebih 24 jam ke depan (throw `INVALID_DATE`), `accountId` milik `businessId` dari JWT (throw `ACCOUNT_NOT_FOUND`)
    - Jika salah satu item gagal: rollback seluruh `prisma.$transaction()` → tidak ada Transaction tersimpan
    - Pertahankan backward compatibility: jika `selectedItems` tidak ada, gunakan alur existing dengan `dto.accountId` langsung
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x] 12.3 Implementasi `rejectImport()` method baru
    - Buat method `rejectImport(id: string, reason: string | undefined, businessId: string): Promise<...>`
    - Validasi: item harus milik `businessId` dari JWT (throw 403), status harus `PENDING_REVIEW` atau `PROCESSING` (throw `IMPORT_ALREADY_PROCESSED` jika sudah `APPROVED`/`REJECTED`)
    - Update `ImportBatchItem`: `status = REJECTED`, `errorMessage = reason`
    - Tidak membuat `Transaction` apapun
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 12.4 Perbarui `getImportItem()` untuk mengembalikan field baru
    - Update response shape untuk include: `parsedItems`, `confidence`, `rawOcrText`, `inputType`
    - Field-field ini bernilai `null` untuk import lama yang tidak memiliki data (backward compatible)
    - _Requirements: 5.1, 5.2, 11.2_

  - [ ]* 12.5 Tulis property test untuk `approveImport()` dan `rejectImport()`
    - **Property 1: Setiap ImportBatchItem APPROVED memiliki tepat satu Transaction** — generate arbitrary `selectedItems`, verifikasi setiap item menghasilkan tepat satu Transaction dengan `sourceType: IMPORT_OCR`
    - **Memvalidasi: Requirements 6.1, 6.2, 6.3**
    - **Property 4: businessId Transaction selalu dari JWT** — mock arbitrary JWT businessId, verifikasi Transaction yang dibuat menggunakan businessId dari JWT bukan dari body
    - **Memvalidasi: Requirements 6.3, 8.1**
    - **Property 5: State machine ImportBatchItem bersifat unidirectional** — generate arbitrary terminal state (APPROVED/REJECTED), verifikasi semua operasi menghasilkan HTTP 400
    - **Memvalidasi: Requirements 6.5, 7.3**
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 7.3, 8.1_

- [x] 13. Update `OcrProcessingController` dengan Endpoint Baru

  - [x] 13.1 Perbarui controller untuk `inputType` di upload dan tambah endpoint `/reject`
    - Update `uploadReceipt()`: parse `inputType` dari multipart body menggunakan `UploadImportDto`, teruskan ke `ocrService.processImportRequest()`, tambah `FileTypeValidator` untuk `image/webp`
    - Terapkan `UploadRateLimiterGuard` (dari task 10.1) ke endpoint `POST /imports`
    - Tambah endpoint baru `PATCH /imports/:id/reject` dengan body opsional `{ reason?: string }` yang memanggil `ocrService.rejectImport()`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 7.1, 11.6_

- [x] 14. Daftarkan Provider Baru ke `OcrProcessingModule`

  - [x] 14.1 Update `ocr-processing.module.ts` untuk inject provider baru
    - Tambah `GeminiOcrProvider`, `GoogleVisionOcrProvider`, `TesseractOcrProvider` ke array `providers`
    - Pastikan `OcrProviderFactory` menerima ketiga provider baru via DI
    - Pastikan `RedisModule` sudah di-import (untuk quota management)
    - _Requirements: 3.1, 4.1, 4.3, 4.5_

- [ ] 15. Checkpoint — Validasi Integrasi Penuh
  - Pastikan semua unit test dan integration test berjalan. Tanya user jika ada pertanyaan.

- [ ] 16. Integration Tests

  - [ ]* 16.1 Tulis integration tests untuk alur upload → OCR → review → approve
    - **Property 6: Tenant isolation ditegakkan di semua endpoint imports** — test user dari businessId A mengakses item businessId B → HTTP 403
    - **Memvalidasi: Requirements 8.2**
    - Test alur lengkap: `POST /imports` (dengan mock GeminiOcrProvider) → status `PROCESSING` → `PENDING_REVIEW` → `GET /imports/:id` mengembalikan `parsedItems`
    - Test approve flow: `PATCH /imports/:id/approve` dengan `selectedItems` → status `APPROVED`, Transaction dibuat dengan `sourceType: IMPORT_OCR`
    - Test reject flow: `PATCH /imports/:id/reject` → status `REJECTED`, tidak ada Transaction
    - Test idempotency: approve dua kali → hanya satu Transaction yang dibuat
    - Test rate limit upload: 11 request dalam 60 detik dari businessId sama → request ke-11 HTTP 429
    - _Requirements: 1.7, 6.1, 6.2, 6.4, 7.1, 7.2, 8.1, 8.2_

- [ ] 17. Update Dokumentasi Wajib (Definition of Done)

  - [ ] 17.1 Update `docs/master/06-api-contract.md` — Import/OCR Module section
    - Update `POST /imports`: tambahkan field opsional `inputType: "RECEIPT" | "HANDWRITTEN"` di request
    - Update `GET /imports/:id`: tambahkan field baru di response (`parsedItems`, `confidence`, `rawOcrText`, `inputType`)
    - Update `PATCH /imports/:id/approve`: tambahkan field opsional `selectedItems: ApproveLineItemDto[]` di request body
    - Tambah entry baru untuk `PATCH /imports/:id/reject` (endpoint baru) dengan role OWNER, STAFF
    - Ini adalah **Definition of Done wajib** per `07-ai-agent-workflow.md` — PR tidak selesai tanpa update ini
    - _Requirements: 11.1, 11.2, 11.3, 11.6_

  - [ ] 17.2 Update `docs/features/ocr-processing.md` — refleksikan fitur Handwritten Scan
    - Tambah section baru "Fitur Handwritten Scan" dengan deskripsi provider chain, field baru di `ImportBatchItem`, dan alur multi-item
    - Update "Status Perkembangan" dengan checklist item-item baru yang diimplementasi
    - Update daftar endpoint dengan field baru dan endpoint reject
    - _Requirements: 10.1–10.7_

  - [ ] 17.3 Update `docs/master/08-threat-model.md` — provider pihak ketiga baru
    - Sesuai `08-threat-model.md` Section 6: "setiap penambahan provider pihak ketiga yang menyentuh data finansial/foto user" wajib revisi threat model
    - Tambah entry untuk Gemini 1.5 Flash dan Google Cloud Vision di Section 3.7 (Provider OCR Pihak Ketiga): analisis Information Disclosure (foto dikirim ke Google AI Studio) dan Tampering (hasil parsing bisa salah)
    - Perbarui catatan tentang Quota Service Redis di Section 3.6: klarifikasi bahwa key `quota:gemini:rpm:{businessId}` adalah rate limiter per-tenant (bukan shared quota lintas klien), sedangkan `quota:gcv:monthly:{YYYY-MM}` adalah shared quota terpusat — keduanya perlu scope kredensial yang sesuai
    - _Requirements: 8.3, 8.4_

- [ ] 18. Final Checkpoint — Semua Test Pass dan Dokumentasi Lengkap
  - Pastikan semua test (unit + integration + property) pass. Pastikan semua dokumen di task 17 sudah terupdate. Tanya user jika ada pertanyaan.

---

## Notes

- Task bertanda `*` adalah opsional dan dapat dilewati untuk MVP yang lebih cepat
- Setiap task mereferensikan requirements spesifik untuk traceability
- Semua uang menggunakan `Decimal` (via `@IsPositiveDecimal()` validator) — tidak pernah `Float`/`Number`
- Provider existing (Mindee, Azure, Dummy) tidak dimodifikasi secara fungsional — hanya update signature agar kompatibel dengan interface baru
- Checkpoint di task 9 dan 15 memastikan validasi incremental sebelum lanjut ke integrasi
- Property tests menggunakan library `fast-check` sesuai design document
- `businessId` selalu diambil dari JWT token — tidak pernah dari request body
- **Quota key Redis:** `quota:gemini:rpm:{businessId}` adalah rate limiter per-tenant (15 RPM free tier); `quota:gcv:monthly:{YYYY-MM}` adalah shared quota terpusat lintas semua tenant (1.000 unit/bulan). Ini konsisten dengan pola Quota Service di `01-architecture.md` Section 6.3
- **Magic bytes validation:** controller wajib validasi tipe file via magic bytes (bukan hanya `Content-Type` header) sesuai `05-security-checklist.md` Section 3 — `FileTypeValidator` bawaan NestJS saja tidak cukup; gunakan library `file-type` untuk cek magic bytes
- **Definition of Done:** task 17 (update docs) adalah wajib, bukan opsional — sesuai aturan `07-ai-agent-workflow.md`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "10.1"] },
    { "id": 3, "tasks": ["4.1", "5.1", "6.1"] },
    { "id": 4, "tasks": ["4.2", "5.2", "6.2", "7.1"] },
    { "id": 5, "tasks": ["7.2", "8.1", "11.1"] },
    { "id": 6, "tasks": ["8.2", "12.1", "12.3"] },
    { "id": 7, "tasks": ["12.2", "12.4", "14.1"] },
    { "id": 8, "tasks": ["12.5", "13.1"] },
    { "id": 9, "tasks": ["16.1"] },
    { "id": 10, "tasks": ["17.1", "17.2", "17.3"] }
  ]
}
```

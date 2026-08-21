# Dokumentasi Fitur: OCR Processing

## Deskripsi Singkat
Modul OCR Processing bertugas mengekstrak teks dan data dari gambar struk atau invoice, kemudian mengubahnya menjadi Transaksi setelah direview dan disetujui pengguna.

## Status Perkembangan
- [x] Inisiasi Modul OCR
- [x] Implementasi Service OCR (Dummy Provider — siap diganti dengan Mindee/Azure/OCR.space)
- [x] Pembuatan Endpoint/Controller (dengan JWT Auth Guard)
- [x] BullMQ Worker untuk background processing
- [x] Integrasi dengan TransactionService saat approve
- [x] Tenant isolation (businessId validation di setiap endpoint)
- [x] Migrasi database (`ImportBatch`, `ImportBatchItem`)

## Endpoints API

### POST /api/v1/imports
- **Role**: OWNER, STAFF
- **Content-Type**: `multipart/form-data`
- **Field**: `file` (image/jpeg atau image/png, maks 5MB)
- **Response 202**: `{ importBatchItemId, status: 'PROCESSING' }`

### GET /api/v1/imports/:id
- **Role**: OWNER, STAFF
- **Response 200**: `{ id, status, parsedData, providerUsed, imageUrl, errorMessage, createdAt, updatedAt }`

### PATCH /api/v1/imports/:id/approve
- **Role**: OWNER, STAFF
- **Request Body**: `{ accountId, type, amount, currency, occurredAt, description?, categoryId?, counterAccountId?, counterAmount?, exchangeRateUsed? }`
- **Response 200**: `{ transactionId, status: 'APPROVED' }`

## State Machine
```
PROCESSING → PENDING_REVIEW → APPROVED
                           ↘ REJECTED
PROCESSING → ERROR
```

## Catatan Implementasi
- **OCR Worker**: Menggunakan `DummyOcrProvider` yang mensimulasikan hasil OCR. Ganti dengan `MindeeProvider` / `AzureProvider` saat API key tersedia.
- **File Storage**: Menggunakan `DummyStorageService`. Ganti dengan `CloudinaryService` saat kredensial Cloudinary tersedia.
- **Idempotency**: Saat approve, idempotency key di-generate otomatis server-side via `randomUUID()`.
- **Tenant Isolation**: Setiap endpoint memvalidasi bahwa `ImportBatchItem` milik `businessId` dari JWT token.

## Catatan Error & Bugs
- **[2026-08-20]**: Modul berhasil diimplementasikan dengan Dummy Provider.

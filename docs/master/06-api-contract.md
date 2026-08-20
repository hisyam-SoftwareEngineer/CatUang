# 06 — API Contract (Living Document)
## UMKM Finance Tracker

> **Aturan wajib:** file ini di-update di PR yang SAMA saat endpoint ditambah/diubah — bukan tugas terpisah yang menyusul belakangan. Masuk Definition of Done (`07-ai-agent-workflow.md`). Kalau memungkinkan, generate ulang `types/` di frontend dari file ini (atau dari OpenAPI decorator NestJS) supaya FE-BE tidak pernah mismatch diam-diam.
>
> **Semua path di bawah relatif terhadap `/api/v1`** (misal `/auth/login` sebenarnya `/api/v1/auth/login`) — lihat `03-backend-guide.md` Section 9 soal alasan versioning sejak awal.

---

## Format Tiap Entry

```
### METHOD /path
Role: OWNER | STAFF | PUBLIC
Request: { field: tipe }
Response 200: { field: tipe }
Response error: errorCode yang mungkin muncul
```

---

## Auth Module

> Pola hybrid token — detail lengkap & alasan di `01-architecture.md` §8.5 dan `03-backend-guide.md` Section 5.

### POST /auth/register
Role: PUBLIC
Request: `{ email: string, password: string, businessName: string }`
Response 201: `{ userId: string, businessId: string, accessToken: string }` (refresh token & csrf-token diset sebagai cookie di response header, tidak di body)
Error: `EMAIL_ALREADY_REGISTERED`

### POST /auth/login
Role: PUBLIC
Request: `{ email: string, password: string }`
Response 200: `{ accessToken: string, user: { id, role, businessId } }` (refresh token httpOnly cookie + csrf-token cookie diset via `Set-Cookie`, tidak ada di body)
Error: `INVALID_CREDENTIALS`

### POST /auth/refresh
Role: PUBLIC (tapi butuh refresh token cookie valid)
Request: header `X-CSRF-Token` (dicocokkan dengan cookie `csrf-token`), cookie refresh token otomatis terkirim browser
Response 200: `{ accessToken: string }` (refresh token cookie lama di-invalidate, cookie baru diset)
Error: `INVALID_REFRESH_TOKEN`, `CSRF_TOKEN_MISMATCH`, `TOKEN_REUSE_DETECTED` (sesi di-revoke paksa)

### POST /auth/logout
Role: OWNER, STAFF
Request: header `X-CSRF-Token`
Response 200: `{ success: true }` (refresh token cookie di-invalidate & dihapus)
Error: `CSRF_TOKEN_MISMATCH`

---

## Account Module

### POST /accounts
Role: OWNER
Request: `{ name: string, type: 'CASH'|'BANK'|'EWALLET'|'RECEIVABLE'|'PAYABLE', currency: string (ISO 4217, immutable setelah dibuat) }`
Response 201: `{ id, name, currency, balance: 0 }`
Error: `UNSUPPORTED_CURRENCY`

### GET /accounts
Role: OWNER, STAFF
Response 200: `{ items: [{ id, name, type, currency, balance }] }`

---

## Transaction Module

### POST /transactions
Role: OWNER, STAFF
Header: `Idempotency-Key: <UUID>` **wajib** (lihat `03-backend-guide.md` Section 4a — mencegah duplikasi dari retry client)
Request:
```json
{
  "accountId": "string (UUID)",
  "categoryId": "string (UUID, opsional)",
  "type": "MASUK | KELUAR | TRANSFER",
  "amount": "string (Decimal, selalu positif — arah ditentukan type)",
  "currency": "string (ISO 4217, wajib sama dengan Account.currency untuk MASUK/KELUAR)",
  "occurredAt": "string (ISO 8601 datetime)",
  "description": "string (opsional, max 500 karakter)",
  "counterAccountId": "string (UUID, wajib untuk TRANSFER)",
  "counterAmount": "string (Decimal, wajib untuk TRANSFER lintas-currency)",
  "exchangeRateUsed": "string (Decimal precision 18,6 — wajib untuk TRANSFER lintas-currency, diisi eksplisit client)"
}
```
**Aturan validasi per type:**
- `MASUK`/`KELUAR`: `currency` wajib sama dengan `Account.currency` terkait. `counterAccountId`, `counterAmount`, `exchangeRateUsed` harus kosong/null.
- `TRANSFER` same-currency: `counterAccountId` wajib, `accountId ≠ counterAccountId`. `exchangeRateUsed` tidak diperlukan (system set ke 1).
- `TRANSFER` cross-currency: `counterAccountId` wajib, `counterAmount` wajib, `exchangeRateUsed` wajib — **client yang input kurs, bukan backend menghitung otomatis**.
- `counterCurrency` **tidak perlu dikirim client** — backend mengambil otomatis dari `counterAccount.currency`.

Response 201:
```json
{
  "id": "string",
  "accountId": "string",
  "type": "MASUK | KELUAR | TRANSFER",
  "amount": "string (Decimal)",
  "currency": "string",
  "occurredAt": "string (ISO 8601)",
  "status": "CONFIRMED",
  "sourceType": "MANUAL",
  "newBalance": "string (Decimal — saldo akun setelah transaksi ini)"
}
```
Error: `INSUFFICIENT_BALANCE`, `ACCOUNT_NOT_FOUND`, `CURRENCY_MISMATCH`, `EXCHANGE_RATE_REQUIRED`, `IDEMPOTENCY_KEY_REQUIRED`, `SAME_ACCOUNT_TRANSFER`

### GET /transactions
Role: OWNER, STAFF
Query params:
```
page       int    default: 1, min: 1
pageSize   int    default: 20, max: 100
accountId  string opsional — filter by accountId
from       string opsional — ISO 8601 date, filter occurredAt >= from
to         string opsional — ISO 8601 date, filter occurredAt <= to
includeVoided boolean default: false — kalau false, hanya CONFIRMED yang dikembalikan
```
Response 200:
```json
{
  "items": [
    {
      "id": "string",
      "accountId": "string",
      "categoryId": "string | null",
      "type": "MASUK | KELUAR | TRANSFER",
      "amount": "string",
      "currency": "string",
      "description": "string | null",
      "occurredAt": "string",
      "status": "CONFIRMED | VOID",
      "sourceType": "MANUAL | IMPORT_OCR",
      "counterAccountId": "string | null",
      "counterAmount": "string | null",
      "exchangeRateUsed": "string | null",
      "createdAt": "string"
    }
  ],
  "total": "number (total rows matching filter — untuk pagination client)",
  "page": "number",
  "pageSize": "number"
}
```
Catatan: `total` adalah jumlah baris yang cocok dengan filter saat ini, bukan total seluruh transaksi bisnis.

### PATCH /transactions/:id/void
Role: OWNER
**Void membalik saldo secara atomik:**
- MASUK yang di-void: `account.balance -= amount`
- KELUAR yang di-void: `account.balance += amount`
- TRANSFER yang di-void: kedua saldo dibalik dalam satu `$transaction()`
- Transaksi yang sudah `VOID` tidak bisa di-void lagi → `TRANSACTION_ALREADY_VOID`
- Menggunakan row lock (SELECT FOR UPDATE) — sama seperti create
- `beforeState` (status CONFIRMED) dan `afterState` (status VOID) dicatat di AuditLog **inline di service**, bukan via interceptor (karena interceptor tidak bisa capture pre-state)

Response 200:
```json
{
  "id": "string",
  "status": "VOID",
  "accountId": "string",
  "newBalance": "string (saldo akun setelah reversal)"
}
```
Error: `TRANSACTION_NOT_FOUND`, `TRANSACTION_ALREADY_VOID`, `FORBIDDEN`

---

## Exchange Rate Module

### GET /exchange-rates
Role: OWNER, STAFF
Response 200: `{ items: [{ id, fromCurrency, toCurrency, rate, effectiveDate }] }`

### POST /exchange-rates
Role: OWNER
Request: `{ fromCurrency: string, toCurrency: string, rate: Decimal, effectiveDate: string }`
Response 201: `{ id, fromCurrency, toCurrency, rate, effectiveDate }`
Catatan: dipakai sebagai default saat input TRANSFER lintas-currency & konversi tampilan laporan mode Gabungan (`01-architecture.md` Section 4.6) — tidak pernah menimpa `exchangeRateUsed` yang sudah tersimpan di `Transaction` lama.

---

## Import/OCR Module

### POST /imports
Role: OWNER, STAFF
Request: `multipart/form-data { file }`
Response 202: `{ importBatchItemId, status: 'PROCESSING' }`

### GET /imports/:id
Role: OWNER, STAFF
Response 200: `{ id, status, parsedData, providerUsed }`

### PATCH /imports/:id/approve
Role: OWNER, STAFF
Request: `{ correctedData?: {...} }`
Response 200: `{ transactionId, status: 'APPROVED' }`

---

## Report & Export Module

### GET /reports/profit-loss?from=&to=&mode=PER_CURRENCY|COMBINED
Role: OWNER
Response 200 (mode `PER_CURRENCY`): `{ byCurrency: [{ currency, totalMasuk, totalKeluar, labaRugi, byCategory: [...] }] }`
Response 200 (mode `COMBINED`): `{ baseCurrency, totalMasuk, totalKeluar, labaRugi, byCategory: [...], exchangeRatesUsed: [{ currency, rate, effectiveDate }] }`
Error: `FORBIDDEN` (kalau diakses STAFF)

### POST /exports
Role: OWNER
Request: `{ reportType: 'PROFIT_LOSS'|'ASSET_POSITION', mode: 'PER_CURRENCY'|'COMBINED', format: 'PDF'|'CSV'|'XLSX'|'JSON'|'XML', template?: 'SIMPLE'|'KUR'|'DETAILED', from: string, to: string }`
Response 202: `{ exportJobId, status: 'PROCESSING' }`

### GET /exports/:id
Role: OWNER
Response 200: `{ id, status, downloadUrl? }` (signed URL, expiry pendek)

---

## Settings Module

### GET /settings
Role: OWNER, STAFF (read-only untuk STAFF)
Response 200: `{ baseCurrency (default: "IDR"), realtimeSyncEnabled, ocrProviderPriority, ocrProviderEnabled, ocrQuotaThresholdPercent, defaultExportFormat, defaultPdfTemplate, enableMultiCurrency (default: false), waLinked (boolean, read-only — apakah nomor WA sudah terhubung) }`

### PATCH /settings
Role: OWNER
Request: `{ ...partial BusinessSettings }` — termasuk `enableMultiCurrency: boolean`
Response 200: `{ ...updated BusinessSettings }`
Error: `FORBIDDEN` (kalau STAFF coba akses)

---

## SSE Endpoint (Opsional, sesuai Settings)

### GET /sync/events (Server-Sent Events)
Role: OWNER, STAFF
Event: `event: balance-changed` — client fetch ulang data terkait, tidak menerima payload data langsung (lihat `01-architecture.md` Section 5.4)

---

## WhatsApp Bot Module

> Dibangun Phase 2+. Detail arsitektur lengkap di `01-architecture.md` Section 12 dan `docs/idea/01-whatsapp-bot.md`.

### POST /webhooks/whatsapp
Role: PUBLIC (tapi diverifikasi via HMAC-SHA256 dari Meta — bukan endpoint untuk user langsung)
Request: Meta WABA webhook payload (JSON)
Header: `X-Hub-Signature-256` — wajib diverifikasi sebelum diproses
Response 200: `{ status: 'ok' }` (Meta butuh 200 dalam 20 detik, proses async)
Catatan: Endpoint ini BUKAN untuk dipanggil user atau frontend — hanya untuk Meta webhook.

### POST /whatsapp/link
Role: OWNER, STAFF
Request: `{ phone: string }` — format E.164 (+628xxx), nomor WA yang akan dihubungkan
Response 200: `{ status: 'verification_sent' }` — kode 6 digit dikirim ke nomor WA tersebut
Error: `INVALID_PHONE_FORMAT`, `PHONE_ALREADY_LINKED`

### POST /whatsapp/verify
Role: OWNER, STAFF
Request: `{ code: string }` — kode 6 digit yang diterima via WA
Response 200: `{ waLinked: true, phone: string }`
Error: `INVALID_CODE`, `CODE_EXPIRED`

### DELETE /whatsapp/link
Role: OWNER, STAFF
Response 200: `{ waLinked: false }` — nomor WA di-unlink, akses via bot langsung dicabut


---

*Tambahkan entry baru di sini setiap kali ada endpoint baru. Jangan biarkan dokumen ini basi — endpoint yang tidak ada di sini dianggap belum "resmi" ada.*

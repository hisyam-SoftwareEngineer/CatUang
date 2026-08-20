# Dokumentasi Fitur: Transaction

## Deskripsi Singkat
Modul Transaction menangani pencatatan transaksi masuk (INCOME), keluar (EXPENSE), dan transfer antar akun (TRANSFER). Modul ini juga menangani fitur pembatalan (VOID) transaksi secara atomik dan mendukung multi-currency untuk transaksi jenis transfer.

## Status Perkembangan
- [x] Create Transaction (INCOME/EXPENSE/TRANSFER)
- [x] List Transactions with filters
- [x] Void Transaction (Hanya OWNER)

## Endpoints API

### 1. `POST /transactions`
- **Fungsi**: Membuat transaksi baru (INCOME, EXPENSE, atau TRANSFER).
- **Role**: OWNER, STAFF
- **Kebutuhan Header**: 
  - `Authorization: Bearer <accessToken>`
  - `idempotency-key: <uuid-unik-dari-client>` (Wajib untuk mencegah double-tap/retry duplikasi)
- **Kebutuhan Body (Contoh EXPENSE)**:
  ```json
  {
    "accountId": "uuid-account",
    "categoryId": "uuid-category",
    "type": "EXPENSE",
    "amount": "150000.00",
    "currency": "IDR",
    "occurredAt": "2026-08-20T10:00:00Z",
    "description": "Beli Token Listrik"
  }
  ```
- **Kebutuhan Body (Contoh TRANSFER Beda Currency)**:
  ```json
  {
    "accountId": "uuid-account-idr",
    "type": "TRANSFER",
    "amount": "15000000.00",
    "currency": "IDR",
    "occurredAt": "2026-08-20T10:00:00Z",
    "description": "Convert ke USD",
    "counterAccountId": "uuid-account-usd",
    "counterAmount": "1000.00",
    "exchangeRateUsed": "15000.00"
  }
  ```
- **Output Berhasil (201 Created)**:
  ```json
  {
    "id": "uuid-transaction",
    "type": "EXPENSE",
    "amount": "150000.00",
    "status": "CONFIRMED"
    // ... detail lainnya
  }
  ```

### 2. `GET /transactions`
- **Fungsi**: Menampilkan daftar transaksi dengan pagination dan filter.
- **Role**: OWNER, STAFF
- **Kebutuhan Header**: `Authorization: Bearer <accessToken>`
- **Query Params**:
  - `page` (optional, default: 1)
  - `pageSize` (optional, default: 20)
  - `accountId` (optional)
  - `from` / `to` (optional, format ISO8601)
  - `includeVoided` (optional, boolean, default false)
- **Output Berhasil (200 OK)**:
  ```json
  {
    "items": [
      {
        "id": "uuid-transaction",
        "type": "EXPENSE",
        "amount": "150000.00",
        "status": "CONFIRMED",
        "description": "Beli Token Listrik",
        "occurredAt": "2026-08-20T10:00:00.000Z"
      }
    ],
    "meta": {
      "page": 1,
      "pageSize": 20,
      "totalItems": 1,
      "totalPages": 1
    }
  }
  ```

### 3. `PATCH /transactions/:id/void`
- **Fungsi**: Membatalkan transaksi (VOID) dan membalikkan saldo akun.
- **Role**: OWNER (STAFF dilarang)
- **Kebutuhan Header**: `Authorization: Bearer <accessToken>`
- **Kebutuhan Body**: -
- **Output Berhasil (200 OK)**:
  ```json
  {
    "id": "uuid-transaction",
    "status": "VOID",
    "voidedAt": "2026-08-20T10:05:00.000Z",
    "voidedBy": "uuid-owner"
  }
  ```

## Catatan Error & Bugs
- **[2026-08-20]**: Belum ada error tercatat.

## Catatan Tambahan
Memerlukan header `Idempotency-Key` saat pembuatan transaksi. Jika id yang sama dikirim dua kali (oleh user yang sama), backend akan menolak duplikasinya, menjaga saldo dari pemotongan ganda.

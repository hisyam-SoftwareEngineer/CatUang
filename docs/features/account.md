# Dokumentasi Fitur: Account

## Deskripsi Singkat
Modul Account mengelola akun finansial (misal: Kas, Bank, Piutang, dll.) dalam sebuah entitas bisnis. Setiap akun menyimpan tipe dan mata uangnya masing-masing.

## Status Perkembangan
- [x] Create Account (Hanya OWNER)
- [x] List Accounts (OWNER & STAFF)

## Endpoints API

### 1. `POST /accounts`
- **Fungsi**: Membuat akun finansial baru untuk bisnis yang sedang login.
- **Role**: OWNER
- **Kebutuhan Header**: `Authorization: Bearer <accessToken>`
- **Kebutuhan Body**:
  ```json
  {
    "name": "BCA Utama",
    "type": "CASH", // Nilai enum AccountType (misal: CASH, BANK, dll)
    "currency": "IDR"
  }
  ```
- **Output Berhasil (201 Created)**:
  ```json
  {
    "id": "uuid-account",
    "name": "BCA Utama",
    "type": "CASH",
    "currency": "IDR",
    "businessId": "uuid-business"
  }
  ```

### 2. `GET /accounts`
- **Fungsi**: Menampilkan daftar semua akun milik bisnis yang sedang login.
- **Role**: OWNER, STAFF
- **Kebutuhan Header**: `Authorization: Bearer <accessToken>`
- **Kebutuhan Body**: -
- **Output Berhasil (200 OK)**:
  ```json
  {
    "items": [
      {
        "id": "uuid-account",
        "name": "BCA Utama",
        "type": "CASH",
        "currency": "IDR",
        "balance": "0.00",
        "businessId": "uuid-business"
      }
    ]
  }
  ```

## Catatan Error & Bugs
- **[2026-08-20]**: Belum ada error tercatat.

## Catatan Tambahan
Memiliki interseptor `AuditLog` saat melakukan aksi `CREATE`. Staff dilarang keras untuk membuat account baru.

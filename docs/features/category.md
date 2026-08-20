# Dokumentasi Fitur: Category

## Deskripsi Singkat
Modul Category mengelola kategori transaksi finansial. Ada kategori default dan ada juga kategori kustom yang bisa dibuat oleh user (bisnis).

## Status Perkembangan
- [x] Create Category (Hanya OWNER)
- [x] List Categories (OWNER & STAFF)
- [x] Update Category (Hanya OWNER)
- [x] Delete Category (Hanya OWNER)

## Endpoints API

### 1. `GET /categories`
- **Fungsi**: Mengambil daftar semua kategori aktif (termasuk default dan kustom bisnis).
- **Role**: OWNER, STAFF
- **Kebutuhan Header**: `Authorization: Bearer <accessToken>`
- **Kebutuhan Body**: -
- **Output Berhasil (200 OK)**:
  ```json
  {
    "items": [
      {
        "id": "uuid-category",
        "name": "Makan & Minum",
        "isDefault": true,
        "businessId": null
      }
    ]
  }
  ```

### 2. `POST /categories`
- **Fungsi**: Membuat kategori kustom baru.
- **Role**: OWNER
- **Kebutuhan Header**: `Authorization: Bearer <accessToken>`
- **Kebutuhan Body**:
  ```json
  {
    "name": "Bensin Operasional"
  }
  ```
- **Output Berhasil (201 Created)**:
  ```json
  {
    "id": "uuid-new-category",
    "name": "Bensin Operasional",
    "isDefault": false,
    "businessId": "uuid-business"
  }
  ```

### 3. `PATCH /categories/:id`
- **Fungsi**: Mengubah nama kategori kustom. (Kategori default dilarang diubah)
- **Role**: OWNER
- **Kebutuhan Header**: `Authorization: Bearer <accessToken>`
- **Kebutuhan Body**:
  ```json
  {
    "name": "Bensin & Transportasi"
  }
  ```
- **Output Berhasil (200 OK)**:
  ```json
  {
    "id": "uuid-category",
    "name": "Bensin & Transportasi",
    "isDefault": false,
    "businessId": "uuid-business"
  }
  ```

### 4. `DELETE /categories/:id`
- **Fungsi**: Soft-delete kategori kustom. Tidak bisa dihapus jika masih terkait transaksi atau jika itu adalah kategori default.
- **Role**: OWNER
- **Kebutuhan Header**: `Authorization: Bearer <accessToken>`
- **Kebutuhan Body**: -
- **Output Berhasil (204 No Content)**: (Tidak ada body response)

## Catatan Error & Bugs
- **[2026-08-20]**: Belum ada error tercatat.

## Catatan Tambahan
Kategori kustom bersifat private per `businessId`.

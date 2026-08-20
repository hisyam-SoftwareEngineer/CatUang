# Dokumentasi Fitur: Auth

## Deskripsi Singkat
Modul Auth menangani pendaftaran bisnis (Register), masuk (Login), keluar (Logout), dan rotasi token JWT (Refresh).
Sistem menggunakan `accessToken` yang dikembalikan di response body (digunakan sebagai Bearer token) dan `refreshToken` serta `csrf-token` yang disimpan dalam HTTP Only/Secure cookies.

## Status Perkembangan
- [x] Register
- [x] Login
- [x] Refresh Token
- [x] Logout

## Endpoints API

### 1. `POST /auth/register`
- **Fungsi**: Mendaftarkan bisnis baru sekaligus membuat user OWNER pertama.
- **Kebutuhan Header**: -
- **Kebutuhan Body**:
  ```json
  {
    "email": "owner@bisnis.com",
    "password": "password123",
    "businessName": "Toko Sejahtera"
  }
  ```
- **Output Berhasil (201 Created)**:
  ```json
  {
    "userId": "uuid-user",
    "businessId": "uuid-business",
    "accessToken": "ey..."
  }
  ```
  *(Juga men-set cookie `refreshToken` dan `csrf-token`)*

### 2. `POST /auth/login`
- **Fungsi**: Masuk dan mendapatkan access token.
- **Kebutuhan Header**: -
- **Kebutuhan Body**:
  ```json
  {
    "email": "owner@bisnis.com",
    "password": "password123"
  }
  ```
- **Output Berhasil (200 OK)**:
  ```json
  {
    "accessToken": "ey...",
    "user": {
      "id": "uuid-user",
      "email": "owner@bisnis.com",
      "role": "OWNER",
      "businessId": "uuid-business"
    }
  }
  ```
  *(Juga men-set cookie `refreshToken` dan `csrf-token`)*

### 3. `POST /auth/refresh`
- **Fungsi**: Memperbarui `accessToken` yang kedaluwarsa menggunakan `refreshToken` dari cookie.
- **Kebutuhan Header**: `x-csrf-token: <csrf-token-dari-cookie>`
- **Kebutuhan Body**: -
- **Output Berhasil (200 OK)**:
  ```json
  {
    "accessToken": "ey..."
  }
  ```
  *(Juga men-set ulang cookie `refreshToken` dan `csrf-token`)*

### 4. `POST /auth/logout`
- **Fungsi**: Menghapus sesi / refresh token dari database dan menghapus cookies pada client.
- **Kebutuhan Header**:
  - `Authorization: Bearer <accessToken>`
  - `x-csrf-token: <csrf-token>`
- **Kebutuhan Body**: -
- **Output Berhasil (200 OK)**:
  ```json
  {
    "success": true
  }
  ```

## Catatan Error & Bugs
- **[2026-08-20]**: Belum ada error tercatat.

## Catatan Tambahan
Sistem menggunakan `CsrfGuard` pada `/auth/refresh` dan `/auth/logout` untuk mencegah serangan CSRF yang memanfaatkan cookie. Pastikan client JavaScript selalu membaca nilai cookie `csrf-token` dan mengirimkannya via header `x-csrf-token`.

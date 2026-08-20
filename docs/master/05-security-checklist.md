# 05 — Security Checklist
## UMKM Finance Tracker

> Checklist ini dijalankan di dua titik: (1) AI self-check setelah generate kode yang menyentuh auth/data sensitif, (2) review gate sebelum merge fitur yang menyentuh area ini. Rujuk juga `01-architecture.md` Section 8 untuk konteks arsitektur keamanan, dan `08-threat-model.md` untuk analisis **kenapa** tiap kontrol ini ada (skenario serangan konkret, bukan checklist generik).

---

## 0. Peta OWASP Top 10 (2021) — Di Mana Tiap Kategori Ditangani

Supaya checklist di bawah tidak terasa "daftar acak", berikut pemetaannya ke standar industri. Kalau suatu saat audit eksternal/pentest dilakukan, tabel ini jadi titik awal yang jelas:

| OWASP Kategori | Ditangani di |
|---|---|
| A01 Broken Access Control | Section 2 (IDOR & Role) |
| A02 Cryptographic Failures | Section 1 (hashing password), `01-architecture.md` §8.1 (enkripsi at-rest/in-transit) |
| A03 Injection | Section 3 (Input Validation & Injection) |
| A04 Insecure Design | `08-threat-model.md` secara keseluruhan — ini yang menjawab "apakah desainnya sendiri aman", bukan cuma implementasinya |
| A05 Security Misconfiguration | Section 5a (Security Headers), Section 5 (Secrets & Environment) |
| A06 Vulnerable & Outdated Components | Section 9 (Dependency & Supply Chain) |
| A07 Identification & Authentication Failures | Section 1 (Autentikasi & Sesi), termasuk CSRF di Section 1a |
| A08 Software & Data Integrity Failures | Section 4 (`exchangeRateUsed` immutable), Section 9 (dependency integrity) |
| A09 Security Logging & Monitoring Failures | Section 8 (Logging & Audit) |
| A10 Server-Side Request Forgery | Tidak signifikan untuk app ini saat ini (tidak ada fitur "fetch URL dari user input") — revisit kalau ada fitur seperti itu ditambahkan |

---

## 1. Autentikasi & Sesi
- [ ] Password di-hash `bcrypt`/`argon2`, tidak pernah plaintext atau reversible encryption
- [ ] **Access token** (umur pendek ~15 menit) dikembalikan di response body, disimpan frontend **di memori** (bukan localStorage, bukan cookie) — lihat pola hybrid di `01-architecture.md` §8.5
- [ ] **Refresh token** (umur lebih panjang) di cookie `httpOnly + Secure + SameSite=None`, tidak pernah masuk response body
- [ ] Refresh token **rotation** diimplementasi — token lama invalid setelah dipakai sekali, reuse terdeteksi memicu revoke seluruh sesi
- [ ] Endpoint login & register punya rate limiting (`@nestjs/throttler`)
- [ ] Tidak ada informasi sensitif (password hash, secret internal) pernah masuk ke response API, sekecil apa pun

## 1a. CSRF Protection (Konsekuensi Cross-Origin Vercel↔Railway)
- [ ] `/auth/refresh` dan `/auth/logout` (satu-satunya endpoint bergantung cookie) dilindungi double-submit CSRF token — detail pola di `03-backend-guide.md` Section 5
- [ ] Endpoint lain (pakai `Authorization: Bearer` header) dikonfirmasi **tidak** menerima auth via cookie sama sekali — kalau ada endpoint yang menerima keduanya (cookie ATAU header), itu celah CSRF yang tidak sengaja
- [ ] CORS `credentials: true` dengan **origin eksplisit per klien** dari env var — bukan wildcard `*`

## 2. Authorization (IDOR & Role)
- [ ] Setiap endpoint yang akses data by-ID (`GET /transactions/:id`) memvalidasi data itu **milik business yang sedang login**, bukan cuma cek ID valid — mencegah IDOR (user A bisa akses data user B dengan menebak ID)
- [ ] Endpoint khusus `OWNER` (kelola user, ubah Settings, export, hapus akun) memakai `@Roles('OWNER')` guard eksplisit, bukan cek manual yang mudah lupa ditambahkan
- [ ] `STAFF` tidak bisa akses laporan Untung/Rugi lengkap (sesuai role di `01-architecture.md` Section 4.5) — dicek di level backend, bukan cuma disembunyikan di UI frontend

## 3. Input Validation & Injection
- [ ] Semua input lewat DTO + `class-validator`, `ValidationPipe` global dengan `whitelist: true`
- [ ] Tidak ada raw SQL string concatenation — Prisma parameterized query, atau `$queryRaw` dengan tagged template (bukan string interpolation manual)
- [ ] Upload file (foto struk) divalidasi **MIME type DAN magic bytes** (bukan cuma ekstensi filename) sebelum diteruskan ke Cloudinary/OCR provider — tolak SVG (bisa berisi script)
- [ ] Ukuran file upload divalidasi di client maupun server (bukan cuma client — validasi client bisa di-bypass)

## 4. Data Finansial Spesifik
- [ ] Tidak ada kolom uang bertipe `Float`/`Number` — selalu `Decimal`
- [ ] Perubahan `Account.balance` selalu dalam `$transaction` dengan row lock (mencegah race condition, Section 5.1 arsitektur)
- [ ] Hasil OCR tidak pernah auto-commit ke `Transaction` tanpa status `APPROVED` dari review manusia
- [ ] Setiap kolom uang punya `currency` eksplisit yang tervalidasi (Section 4.6 arsitektur) — tidak ada asumsi diam-diam `'IDR'`
- [ ] `exchangeRateUsed` di `Transaction` TRANSFER lintas-currency **immutable** setelah tersimpan — update `ExchangeRate` baru tidak pernah menimpa kurs historis yang sudah dipakai transaksi lama
- [ ] `POST /transactions` menerima & memproses header `Idempotency-Key` — retry dari client tidak menghasilkan transaksi duplikat (lihat `03-backend-guide.md` Section 4a)

## 5. Secrets & Environment
- [ ] Tidak ada API key/credential hardcoded di kode, walau untuk testing
- [ ] `.env` masuk `.gitignore`, `.env.example` tanpa nilai asli sebagai referensi
- [ ] Env var wajib divalidasi saat startup (Zod), gagal-cepat kalau tidak ada
- [ ] Kredensial shared (Quota Service, API key OCR bersama — Section 6.3 arsitektur) disimpan terpisah dari kredensial per-klien, akses dibatasi
- [ ] Kredensial Quota Service dibatasi scope hanya operasi `INCR`/`GET` pada key `ocr_quota:*` — bukan akses Redis penuh (lihat `08-threat-model.md` Section 3.6)

## 5a. Security Headers
- [ ] `helmet()` terpasang sebagai global middleware, tidak di-skip di environment manapun termasuk staging
- [ ] `Content-Security-Policy` dikonfigurasi spesifik untuk app ini (`connect-src` API sendiri, `img-src` Cloudinary) — bukan CSP default yang terlalu longgar atau terlalu ketat sampai app rusak
- [ ] `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options` aktif (default `helmet()`, dipastikan tidak ter-override)
- [ ] Detail per header & alasannya ada di `01-architecture.md` Section 8.6

## 6. Storage & File Akses
- [ ] Foto struk/dokumen di Cloudinary diakses lewat signed URL bermasa-berlaku pendek, tidak public tanpa token
- [ ] File export (PDF/Excel/CSV) yang berisi data finansial juga pakai signed URL, tidak link permanen publik

## 7. Rate Limiting & Abuse Prevention
- [ ] Endpoint upload (import OCR) punya rate limit — mencegah abuse kuota OCR (relevan karena API key dibagi lintas klien, Section 6.3)
- [ ] Endpoint export (generate PDF/Excel berat) punya rate limit — mencegah worker kebanjiran job dari satu user

## 8. Logging & Audit
- [ ] Log tidak pernah berisi password, JWT penuh, atau data kartu/rekening lengkap
- [ ] Setiap `UPDATE`/`DELETE` pada `Transaction`, `Account`, `Asset/Liability` tercatat di `AuditLog` dengan `userId` (Section 4.4 arsitektur)
- [ ] Error tracking (Sentry) dikonfigurasi untuk **scrub** data sensitif dari payload sebelum terkirim

## 9. Dependency & Supply Chain
- [ ] `npm audit` / dependency scanner dijalankan di CI, fail build kalau ada vulnerability level tinggi
- [ ] Dependency baru dicek reputasinya (jumlah download, maintenance aktif) sebelum ditambahkan
- [ ] SAST (static analysis, misal Semgrep/CodeQL) jalan di CI untuk kode sendiri — dependency scan cuma tangkap vulnerability di library pihak ketiga, bukan bug keamanan di kode yang kita tulis sendiri

## 10. Hak Pengguna & Retensi Data (sesuai `01-architecture.md` Section 8.4)
- [ ] Ada endpoint untuk user export semua datanya sendiri
- [ ] Ada mekanisme hapus akun + data permanen kalau user minta, dengan konfirmasi eksplisit (tidak bisa dibatalkan)

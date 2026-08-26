# Requirements Document

<!-- Handwritten Scan (Pindai Tulisan Tangan) — Design-First Workflow -->
<!-- Referensi Desain: .kiro/specs/handwritten-scan/design.md -->

## Introduction

Mayoritas pemilik UMKM Indonesia masih mencatat transaksi secara manual di buku catatan atau struk tulisan tangan. Fitur **Handwritten Scan** memungkinkan pemilik UMKM memotret halaman buku catatan atau struk tulisan tangan, lalu sistem mengekstrak dan mem-parsing transaksi menjadi data terstruktur yang siap di-review dan disetujui sebelum masuk ke database transaksi.

Fitur ini adalah ekstensi dari modul `ocr-processing` yang sudah ada. Prinsip utama yang tidak dapat dikompromikan:
- **Human-in-the-loop wajib** — tidak ada auto-commit OCR ke Transaction.
- **businessId selalu dari JWT** — tidak pernah dari request body.
- **Semua uang sebagai Decimal** — tidak pernah Float.
- **Multi-tenant isolation** — user satu bisnis tidak dapat mengakses data bisnis lain.

---

## Glossary

- **ImportBatch**: Kelompok satu atau lebih import yang dibuat dalam satu sesi upload.
- **ImportBatchItem**: Satu item import yang merepresentasikan satu gambar. Memiliki lifecycle state machine: `PROCESSING → PENDING_REVIEW → APPROVED/REJECTED` atau `PROCESSING → ERROR`.
- **ParsedLineItem**: Satu baris transaksi yang diekstrak dari gambar oleh provider OCR. Satu gambar buku catatan bisa menghasilkan banyak `ParsedLineItem`.
- **OcrProvider**: Layanan OCR yang memproses gambar dan mengembalikan teks terstruktur. Implementasi: `GeminiOcrProvider`, `GoogleVisionOcrProvider`, `TesseractOcrProvider`.
- **OcrProviderFactory**: Komponen yang menentukan chain provider berdasarkan `inputType`.
- **OcrWorker**: Worker BullMQ yang memproses job OCR secara asynchronous.
- **InputType**: Enum yang menentukan tipe input gambar: `RECEIPT` (struk tercetak) atau `HANDWRITTEN` (tulisan tangan/buku catatan).
- **ImportStatus**: Enum status ImportBatchItem: `PROCESSING`, `PENDING_REVIEW`, `APPROVED`, `REJECTED`, `ERROR`.
- **Confidence**: Skor kepercayaan hasil OCR dari provider, berupa nilai Float antara 0.0 hingga 1.0. Merupakan metadata (bukan nilai uang), sehingga Float diizinkan.
- **businessId**: Identifier unik bisnis yang selalu diambil dari JWT token — tidak pernah dari request body.
- **Terminal State**: Status yang tidak dapat diubah ke status lain. `APPROVED` dan `REJECTED` adalah terminal states.
- **Chain Provider**: Urutan provider OCR yang dicoba secara berurutan — jika provider pertama gagal/rate-limited, provider berikutnya dicoba.

---

## Requirements

### Requirement 1: Upload Foto untuk Pemrosesan OCR

**User Story:** Sebagai pemilik UMKM, saya ingin mengunggah foto buku catatan atau struk tulisan tangan melalui aplikasi, agar sistem dapat mengekstrak transaksi dari foto tersebut secara otomatis.

#### Acceptance Criteria

1. WHEN pengguna mengirim `POST /api/v1/imports` dengan file gambar valid dan `inputType: HANDWRITTEN`, THE System SHALL membuat `ImportBatch` dan `ImportBatchItem` baru dengan status `PROCESSING` lalu mengembalikan HTTP 202 dengan `importBatchItemId`.

2. WHEN field `inputType` tidak disertakan dalam request, THE System SHALL menggunakan nilai default `RECEIPT` untuk menjaga backward compatibility dengan alur struk tercetak yang sudah ada.

3. IF ukuran file gambar melebihi 5MB di sisi server, THEN THE System SHALL menolak request dengan HTTP 400 dan `errorCode: FILE_TOO_LARGE`.

4. IF tipe MIME file bukan `image/jpeg`, `image/png`, atau `image/webp`, THEN THE System SHALL menolak request dengan HTTP 400 dan `errorCode: INVALID_FILE_TYPE`.

5. IF tidak ada file yang disertakan dalam request, THEN THE System SHALL menolak request dengan HTTP 400 dan `errorCode: FILE_REQUIRED`.

6. WHEN file gambar valid diterima, THE System SHALL memvalidasi tipe file berdasarkan magic bytes file sekaligus `Content-Type` header — tidak hanya berdasarkan nama ekstensi atau header saja.

7. WHILE pengguna yang sama (per `businessId`) telah mengirim 10 request upload dalam 60 detik terakhir, THE System SHALL menolak request berikutnya dengan HTTP 429.

8. WHEN file gambar berhasil diterima oleh API, THE System SHALL mengunggah gambar ke Cloudinary dengan transformasi `q_auto:good`, `w_1920,c_limit`, dan `f_auto` sebelum menyimpan URL ke `ImportBatchItem.imageUrl`.

---

### Requirement 2: Kompresi Gambar di Sisi Klien

**User Story:** Sebagai pemilik UMKM yang menggunakan HP Android entry-level dengan koneksi 4G/3G tidak stabil, saya ingin gambar dikompresi secara otomatis di perangkat saya sebelum dikirim, agar upload tidak memakan waktu lama dan tidak menghabiskan kuota data saya.

#### Acceptance Criteria

1. WHEN pengguna memilih gambar dari kamera atau galeri, THE Client SHALL memproses gambar secara non-blocking (menggunakan Web Worker) sehingga antarmuka pengguna tetap responsif selama kompresi berlangsung.

2. WHEN lebar gambar asli melebihi 1920 piksel, THE Client SHALL mengubah ukuran gambar menjadi maksimum 1920 piksel lebar dengan mempertahankan rasio aspek asli.

3. THE Client SHALL mengompresi gambar menggunakan kualitas JPEG 80% sebagai titik awal, kemudian menurunkan kualitas secara bertahap (70%, 60%) hingga ukuran file berada di bawah 2MB.

4. WHEN gambar memiliki metadata EXIF yang menunjukkan orientasi selain 0 derajat, THE Client SHALL memperbaiki orientasi gambar berdasarkan metadata EXIF tersebut sebelum upload.

5. WHEN kompresi gambar selesai, THE Client SHALL menampilkan indikator progress yang menunjukkan status "Memproses gambar..." diikuti "Mengunggah..." kepada pengguna.

---

### Requirement 3: Pemrosesan OCR Asynchronous

**User Story:** Sebagai pemilik UMKM, saya ingin sistem memproses foto saya di latar belakang, agar saya tidak perlu menunggu sambil layar terkunci dan bisa melanjutkan aktivitas lain.

#### Acceptance Criteria

1. WHEN `ImportBatchItem` dengan `inputType: HANDWRITTEN` antri di BullMQ worker, THE OcrWorker SHALL menggunakan chain provider `[Gemini 1.5 Flash → Google Cloud Vision → Tesseract]` secara berurutan.

2. WHEN `ImportBatchItem` dengan `inputType: RECEIPT` antri di BullMQ worker, THE OcrWorker SHALL menggunakan chain provider existing `[Mindee → Azure → Dummy]` tanpa perubahan.

3. WHEN provider OCR berhasil mengekstrak teks dari gambar, THE OcrWorker SHALL menyimpan `parsedItems`, `confidence`, `rawOcrText`, dan `providerUsed` ke `ImportBatchItem` lalu mengubah statusnya menjadi `PENDING_REVIEW`.

4. IF provider OCR gagal karena error teknis atau rate limit, THEN THE OcrWorker SHALL mencoba provider berikutnya dalam chain tanpa menghentikan pemrosesan.

5. IF semua provider dalam chain gagal setelah seluruh percobaan, THEN THE OcrWorker SHALL mengubah status `ImportBatchItem` menjadi `ERROR` dengan pesan `"Sistem tidak dapat membaca foto ini. Coba masukkan transaksi secara manual."`.

6. THE OcrWorker SHALL melakukan maksimum 3 kali retry dengan exponential backoff (1 detik, 5 detik, 25 detik) sebelum menandai job sebagai gagal permanen.

7. THE OcrWorker SHALL menyelesaikan pemrosesan satu job dalam maksimum 60 detik sebelum timeout dianggap gagal.

8. THE OcrWorker SHALL memproses maksimum 3 job OCR secara bersamaan (concurrency = 3) untuk menjaga total konsumsi rate limit provider tetap terkendali.

---

### Requirement 4: Manajemen Quota Provider OCR

**User Story:** Sebagai operator sistem, saya ingin setiap provider OCR dilindungi oleh batas quota, agar penggunaan free tier tidak melebihi limit dan menyebabkan biaya tak terduga.

#### Acceptance Criteria

1. WHILE penggunaan Gemini 1.5 Flash untuk `businessId` tertentu telah mencapai 12 request dalam 60 detik terakhir, THE OcrProviderFactory SHALL melewati Gemini dan langsung menggunakan provider berikutnya dalam chain.

2. WHEN Gemini berhasil dipanggil untuk satu job OCR, THE System SHALL menginkremen counter Redis dengan key `quota:gemini:rpm:{businessId}` dengan window 60 detik.

3. WHILE total penggunaan Google Cloud Vision dalam bulan berjalan telah mencapai 800 unit, THE OcrProviderFactory SHALL melewati Google Cloud Vision dan langsung menggunakan Tesseract.

4. WHEN Google Cloud Vision berhasil dipanggil, THE System SHALL menginkremen counter Redis dengan key `quota:gcv:monthly:{YYYY-MM}`.

5. THE TesseractOcrProvider SHALL selalu tersedia sebagai provider fallback terakhir tanpa pembatasan quota apapun.

6. WHEN provider diperiksa ketersediaannya sebelum dipanggil, THE OcrProviderFactory SHALL membaca status quota dari Redis dan melewati provider yang telah melebihi batas quota tanpa memanggil API provider tersebut.

---

### Requirement 5: Review Hasil OCR

**User Story:** Sebagai pemilik UMKM, saya ingin melihat dan mengoreksi setiap transaksi yang diekstrak dari foto sebelum disimpan, agar saya bisa memastikan data yang masuk ke buku keuangan saya akurat.

#### Acceptance Criteria

1. WHEN `ImportBatchItem` berstatus `PENDING_REVIEW`, THE System SHALL mengembalikan field `parsedItems`, `confidence`, `rawOcrText`, `inputType`, dan `status` melalui endpoint `GET /api/v1/imports/:id`.

2. THE System SHALL mengembalikan `parsedItems` sebagai array objek `ParsedLineItem`, di mana setiap item memiliki field: `description` (string), `amount` (number positif), `type` (`MASUK` atau `KELUAR`), `date` (string ISO 8601 atau null), dan `confidence` (number 0.0–1.0).

3. WHEN klien melakukan polling ke `GET /api/v1/imports/:id`, THE System SHALL mengembalikan status terbaru dari `ImportBatchItem` termasuk perubahan dari `PROCESSING` ke `PENDING_REVIEW` atau `ERROR`.

4. WHERE fitur `realtimeSyncEnabled` diaktifkan oleh OWNER, THE System SHALL mengirimkan SSE event ke klien ketika status `ImportBatchItem` berubah dari `PROCESSING` ke `PENDING_REVIEW`.

---

### Requirement 6: Approval Transaksi Hasil OCR

**User Story:** Sebagai pemilik UMKM, saya ingin menyetujui item transaksi yang sudah saya koreksi dari hasil scan, agar transaksi tersebut tersimpan ke buku keuangan saya dengan data yang akurat.

#### Acceptance Criteria

1. WHEN pengguna mengirim `PATCH /api/v1/imports/:id/approve` dengan `selectedItems` berisi satu atau lebih `ApproveLineItemDto` yang valid, THE System SHALL membuat tepat satu `Transaction` per item dalam satu `prisma.$transaction()` yang atomis.

2. WHEN approve berhasil diproses, THE System SHALL mengubah status `ImportBatchItem` menjadi `APPROVED` dan menyimpan `transactionId` dari Transaction yang dibuat.

3. WHEN `Transaction` dibuat melalui proses approval OCR, THE Transaction SHALL memiliki `sourceType: IMPORT_OCR` dan `businessId` yang diambil dari JWT token pengguna yang melakukan approval.

4. IF salah satu item dalam `selectedItems` gagal dibuat sebagai Transaction, THEN THE System SHALL melakukan rollback seluruh operasi sehingga tidak ada Transaction maupun perubahan status yang tersimpan.

5. IF `ImportBatchItem` sudah berstatus `APPROVED` atau `REJECTED` saat request approve diterima, THEN THE System SHALL menolak request dengan HTTP 400 dan `errorCode: IMPORT_ALREADY_PROCESSED`.

6. IF `ImportBatchItem` masih berstatus `PROCESSING` saat request approve diterima, THEN THE System SHALL menolak request dengan HTTP 400 dan `errorCode: IMPORT_NOT_READY`.

7. IF nilai `amount` dalam `selectedItems` adalah nol atau negatif, THEN THE System SHALL menolak request dengan HTTP 400 dan `errorCode: INVALID_AMOUNT`.

8. IF nilai `occurredAt` dalam `selectedItems` melebihi 24 jam dari waktu server saat request diterima, THEN THE System SHALL menolak request dengan HTTP 400 dan `errorCode: INVALID_DATE`.

9. IF `accountId` dalam `selectedItems` tidak ditemukan atau tidak dimiliki oleh `businessId` dari JWT token, THEN THE System SHALL menolak request dengan HTTP 404 dan `errorCode: ACCOUNT_NOT_FOUND`.

---

### Requirement 7: Reject Hasil OCR

**User Story:** Sebagai pemilik UMKM, saya ingin menolak hasil scan yang tidak akurat atau tidak relevan, agar tidak ada transaksi sampah yang masuk ke buku keuangan saya.

#### Acceptance Criteria

1. WHEN pengguna mengirim `PATCH /api/v1/imports/:id/reject` dengan body opsional `{ reason?: string }`, THE System SHALL mengubah status `ImportBatchItem` menjadi `REJECTED` dan menyimpan `reason` ke field `errorMessage`.

2. WHEN `ImportBatchItem` direjek, THE System SHALL memastikan tidak ada `Transaction` yang dibuat dari item tersebut.

3. IF `ImportBatchItem` sudah berstatus `APPROVED` atau `REJECTED` saat request reject diterima, THEN THE System SHALL menolak request dengan HTTP 400 dan `errorCode: IMPORT_ALREADY_PROCESSED`.

4. WHEN `ImportBatchItem` direjek, THE System SHALL mempertahankan URL gambar di Cloudinary selama minimal 30 hari untuk kemungkinan re-upload manual oleh pengguna.

---

### Requirement 8: Keamanan Upload dan Pemrosesan

**User Story:** Sebagai operator sistem, saya ingin setiap aspek upload dan pemrosesan gambar aman dari penyalahgunaan, agar data pengguna terlindungi dan sistem tidak dapat disalahgunakan.

#### Acceptance Criteria

1. THE System SHALL selalu mengambil `businessId` dari JWT token yang terverifikasi untuk semua operasi pada endpoint `/api/v1/imports/*` — nilai `businessId` dari request body diabaikan sepenuhnya.

2. WHEN pengguna dari `businessId` A mengirim request ke endpoint `/api/v1/imports/:id` di mana item tersebut dimiliki oleh `businessId` B, THE System SHALL mengembalikan HTTP 403 Forbidden.

3. WHEN response dari Gemini OCR tidak dapat di-parse sebagai JSON valid, THE System SHALL mengabaikan response tersebut, menetapkan `confidence: 0`, dan mencoba provider berikutnya — tidak melempar exception yang mengekspos detail internal.

4. THE System SHALL tidak pernah menyertakan nilai `GEMINI_API_KEY` atau `GOOGLE_CLOUD_VISION_API_KEY` dalam response API, log yang dapat diakses pengguna, atau error message.

5. THE System SHALL menyimpan `rawOcrText` untuk keperluan audit dan debugging, namun tidak pernah mengeksekusi konten `rawOcrText` sebagai kode atau perintah sistem.

6. WHEN gambar yang diupload disimpan ke Cloudinary, THE System SHALL menyanitasi nama file lokal sebelum digunakan dalam log — tidak menggunakan nama file asli dari pengguna secara langsung di log.

---

### Requirement 9: Validasi Data Hasil OCR

**User Story:** Sebagai pemilik UMKM, saya ingin sistem memfilter hasil OCR yang jelas tidak masuk akal, agar saya tidak perlu membuang waktu mengoreksi data yang sudah pasti salah.

#### Acceptance Criteria

1. WHEN provider OCR menghasilkan `ParsedLineItem` dengan `amount` bernilai nol atau negatif, THE OcrWorker SHALL menolak item tersebut atau menetapkan `confidence: 0` pada item tersebut sebagai sinyal untuk review ketat.

2. WHEN provider OCR menghasilkan `ParsedLineItem` dengan `date` yang melebihi 24 jam dari waktu pemrosesan, THE OcrWorker SHALL mengganti nilai `date` tersebut dengan `null` dan menetapkan `confidence` item tersebut menjadi lebih rendah.

3. WHEN Gemini mengembalikan JSON response, THE OcrWorker SHALL memvalidasi setiap field `ParsedLineItem` (termasuk `description`, `amount`, `type`, `date`, `confidence`) sebelum menyimpan ke database.

4. WHEN gambar tidak mengandung teks yang dapat dibaca oleh semua provider, THE OcrWorker SHALL mengubah status `ImportBatchItem` menjadi `PENDING_REVIEW` dengan `parsedItems: []` dan `confidence: 0` sehingga pengguna dapat memilih memasukkan data manual.

---

### Requirement 10: Ekstensi Skema Database

**User Story:** Sebagai developer, saya ingin skema database mendukung metadata tulisan tangan tanpa merusak data yang sudah ada, agar fitur baru dan fitur lama dapat berjalan berdampingan.

#### Acceptance Criteria

1. THE Database SHALL memiliki enum `InputType` dengan nilai `RECEIPT` dan `HANDWRITTEN` yang tersedia di PostgreSQL.

2. THE `ImportBatchItem` model SHALL memiliki field `inputType` bertipe `InputType` dengan nilai default `RECEIPT` untuk menjaga backward compatibility.

3. THE `ImportBatchItem` model SHALL memiliki field `parsedItems` bertipe `Json?` untuk menyimpan array `ParsedLineItem` dari hasil OCR multi-item.

4. THE `ImportBatchItem` model SHALL memiliki field `confidence` bertipe `Float?` untuk menyimpan skor kepercayaan keseluruhan dari provider OCR (nilai antara 0.0–1.0, merupakan metadata bukan nilai uang).

5. THE `ImportBatchItem` model SHALL memiliki field `rawOcrText` bertipe `String?` untuk menyimpan teks mentah hasil provider OCR guna keperluan debugging dan audit.

6. THE Database SHALL memiliki index `@@index([inputType])` pada tabel `ImportBatchItem` untuk mendukung query filter berdasarkan tipe input.

7. WHEN migration dijalankan, THE System SHALL tidak mengubah field `parsedData` yang sudah ada di `ImportBatchItem` agar data import lama tetap valid dan dapat diakses.

---

### Requirement 11: Ekstensi API Contract

**User Story:** Sebagai developer frontend, saya ingin API contract diperluas dengan field baru yang konsisten, agar saya dapat mengimplementasikan Review UI tanpa ambiguitas.

#### Acceptance Criteria

1. WHEN klien mengirim `POST /api/v1/imports`, THE System SHALL menerima field opsional `inputType: "RECEIPT" | "HANDWRITTEN"` dalam request body multipart.

2. WHEN klien mengambil `GET /api/v1/imports/:id`, THE System SHALL mengembalikan field tambahan `parsedItems`, `confidence`, `rawOcrText`, dan `inputType` dalam response — field ini bernilai `null` untuk import lama yang tidak memiliki data tersebut.

3. WHEN klien mengirim `PATCH /api/v1/imports/:id/approve`, THE System SHALL menerima field opsional `selectedItems: ApproveLineItemDto[]` untuk alur multi-item handwritten.

4. THE `ApproveLineItemDto` SHALL memiliki field wajib: `description` (string non-kosong), `amount` (string Decimal positif), `type` (`"MASUK" | "KELUAR" | "TRANSFER"`), `occurredAt` (ISO 8601), `accountId` (UUID).

5. THE `ApproveLineItemDto` SHALL memiliki field opsional: `categoryId` (UUID).

6. THE System SHALL mendukung endpoint baru `PATCH /api/v1/imports/:id/reject` dengan body opsional `{ reason?: string }`.

---

## Correctness Properties

*Properti-properti berikut merupakan invariant yang harus selalu benar di semua kondisi eksekusi. Setiap properti menjadi basis property-based test yang diimplementasikan menggunakan library **fast-check**.*

---

### Property 1: Setiap ImportBatchItem APPROVED memiliki tepat satu Transaction

*Untuk semua* `ImportBatchItem` dalam database, jika status item adalah `APPROVED`, maka item tersebut memiliki tepat satu `transactionId` yang tidak null, dan `Transaction` dengan id tersebut ada di database dengan `sourceType: IMPORT_OCR`.

**Memvalidasi: Requirements 6.1, 6.2, 6.3**

---

### Property 2: Amount hasil OCR selalu positif

*Untuk semua* `ParsedLineItem` yang disimpan ke kolom `parsedItems` di `ImportBatchItem`, nilai `amount` selalu lebih besar dari 0. Item dengan `amount <= 0` yang dikembalikan provider tidak boleh lolos ke database — harus ditolak atau `confidence`-nya di-set ke 0.

**Memvalidasi: Requirements 9.1**

---

### Property 3: Tanggal hasil OCR tidak melebihi 24 jam ke depan

*Untuk semua* `ParsedLineItem` dalam `parsedItems` yang memiliki `date` tidak null, nilai `date` tidak boleh melebihi waktu pemrosesan ditambah 24 jam. Tanggal yang melampaui batas ini harus di-nullkan oleh worker sebelum disimpan.

**Memvalidasi: Requirements 9.2, 6.8**

---

### Property 4: businessId Transaction selalu dari JWT token

*Untuk semua* `Transaction` yang dibuat melalui `PATCH /api/v1/imports/:id/approve`, nilai `businessId` pada Transaction selalu sama dengan `businessId` dari JWT token pengguna yang melakukan request — tidak pernah dari payload request body.

**Memvalidasi: Requirements 6.3, 8.1**

---

### Property 5: State machine ImportBatchItem bersifat unidirectional

*Untuk semua* `ImportBatchItem`, jika status adalah `APPROVED` atau `REJECTED` (terminal states), maka status tidak dapat diubah ke status apapun melalui operasi approve atau reject berikutnya — semua request pada terminal state menghasilkan `HTTP 400 IMPORT_ALREADY_PROCESSED`.

**Memvalidasi: Requirements 6.5, 7.3**

---

### Property 6: Tenant isolation ditegakkan di semua endpoint imports

*Untuk semua* kombinasi `(requestBusinessId, itemBusinessId)` di mana `requestBusinessId ≠ itemBusinessId`, setiap request ke `/api/v1/imports/:id` selalu menghasilkan `HTTP 403 Forbidden` — tidak ada data `ImportBatchItem` milik bisnis lain yang pernah dikembalikan.

**Memvalidasi: Requirements 8.2**

---

### Property 7: Provider yang melebihi quota tidak dipanggil dalam chain

*Untuk semua* OCR job yang diproses worker, setiap provider yang `isRateLimited()` atau `isQuotaExhausted()` mengembalikan `true` tidak boleh dipanggil dalam chain request tersebut — pemeriksaan quota di Redis harus dilakukan sebelum pemanggilan API provider.

**Memvalidasi: Requirements 4.1, 4.3, 4.6**

---

### Property 8: Kompresi client-side menghasilkan output dalam batas yang ditentukan

*Untuk semua* gambar input dengan ukuran dan dimensi apapun, pipeline kompresi client-side selalu menghasilkan output dengan ukuran ≤ 2MB dan lebar ≤ 1920 piksel. Algoritma kompresi iteratif (menurunkan quality dari 80% → 70% → 60%) memastikan constraint ini terpenuhi.

**Memvalidasi: Requirements 2.2, 2.3**

# 08 — Threat Model
## UMKM Finance Tracker

> File ini melengkapi `05-security-checklist.md`. Checklist itu menjawab "apakah kontrol X sudah ada di kode", file ini menjawab pertanyaan yang lebih mendasar: **"skenario serangan apa saja yang realistis terhadap arsitektur ini, dan kenapa kontrol yang kita pilih relevan untuk skenario itu"**. Metodenya STRIDE, diterapkan per komponen nyata di `01-architecture.md`, bukan checklist generik dari internet.

---

## 1. Aset yang Dilindungi

| Aset | Kenapa berharga | Dampak kalau bocor/rusak |
|---|---|---|
| Kredensial login (password hash, session) | Kunci akses ke seluruh data bisnis satu klien | Penyerang bisa lihat/ubah/hapus data finansial bisnis orang |
| Data transaksi & saldo | Data finansial riil usaha kecil, seringkali representasi mata pencaharian | Kebocoran privasi bisnis, manipulasi saldo = kerugian riil |
| Foto struk/dokumen (Cloudinary) | Bisa berisi info tambahan (lokasi toko, nomor rekening di struk transfer) | Kebocoran privasi, potensi social engineering lanjutan |
| `exchangeRateUsed` & histori transaksi | Dasar laporan yang dilampirkan ke pengajuan KUR (brief Section 3) | Manipulasi bisa berujung ke dokumen palsu untuk pengajuan resmi |
| API key OCR bersama (Section 6.3 arsitektur) | **Shared resource lintas SEMUA klien** — bukan cuma satu bisnis | Kebocoran bisa memutus layanan OCR seluruh klien sekaligus, atau dipakai pihak lain gratis pakai kuota kita |
| Kredensial Quota Service (Upstash) | Mengontrol fallback logic OCR seluruh klien | Kalau diubah pihak jahat, bisa memaksa semua klien selalu jatuh ke Tesseract (kualitas terendah) |

## 2. Aktor & Sumber Ancaman

| Aktor | Motivasi realistis | Prioritas |
|---|---|---|
| Penyerang eksternal anonim (bot/scanner otomatis) | Mencari kredensial lemah, endpoint tidak terlindungi, mencoba exploit dependency dikenal | **Tinggi** — ini yang paling sering terjadi di dunia nyata, bukan penyerang tertarget |
| `STAFF` yang disalahgunakan/akun dicuri (Section 4.5 arsitektur) | Akses sah tapi terbatas, potensi disalahgunakan untuk lihat data di luar kewenangan atau input transaksi palsu | Sedang — mitigasi lewat role boundary (Section 2 checklist) |
| Klien lain di model hosting multi-klien (Section 6.1) | Karena API key OCR **dibagi bersama**, ini satu-satunya jalur di mana "klien lain" secara arsitektural menyentuh resource yang sama | Sedang — scope-nya sempit (cuma quota counter, bukan data), tapi tetap perlu dipastikan tidak bisa meluas |
| Supply-chain (dependency NPM berbahaya/dikompromikan) | Banyak kejadian nyata paket NPM disusupi kode jahat | Sedang-Tinggi, mengingat kecepatan rilis ekosistem JS |
| Penyerang tertarget ke satu bisnis spesifik (misal kompetitor/mantan karyawan) | Rendah probabilitas per klien individual, tapi dampak tinggi kalau terjadi | Rendah probabilitas, tinggi dampak |

**Di luar cakupan (accepted, bukan diabaikan tanpa sadar):** ancaman dari staf internal Anda sendiri (operator platform), kompromi di level infrastruktur Vercel/Railway/Supabase/Cloudinary itu sendiri (dipercaya sebagai vendor, mitigasi lewat memilih vendor reputable dengan sertifikasi standar), dan serangan fisik ke device pemilik UMKM (di luar kendali aplikasi).

---

## 3. Analisis STRIDE per Komponen

### 3.1 Vercel — Frontend (Next.js)

| STRIDE | Skenario | Mitigasi | Referensi |
|---|---|---|---|
| **S**poofing | Phishing meniru tampilan login | Tidak ada kontrol teknis penuh (di luar app), tapi domain resmi + tidak pernah minta password lewat channel lain | — |
| **T**ampering | XSS inject script lewat input user (nama kategori custom, dsb) yang tampil ke user lain | React auto-escape by default (bukan `dangerouslySetInnerHTML`), CSP header (Section 8.6) | `03-backend-guide.md` §10 |
| **I**nformation Disclosure | Access token dicuri lewat XSS kalau disimpan di localStorage | **Keputusan arsitektur:** access token di memori (bukan localStorage/cookie biasa) — window exposure kecil (Section 5 backend guide) | `03-backend-guide.md` §5 |
| **D**enial of Service | Tidak signifikan — Vercel edge scaling otomatis menyerap traffic normal | — | — |
| **E**levation of Privilege | Client-side role check di-bypass (`if (role === 'OWNER')` di komponen doang) | Role **selalu** divalidasi ulang di backend, frontend cuma UX (Section 9 frontend guide) | `02-frontend-guide.md` §9 |

### 3.2 Railway — NestJS API

| STRIDE | Skenario | Mitigasi | Referensi |
|---|---|---|---|
| **S**poofing | Brute-force login, credential stuffing pakai daftar password bocor dari breach lain | Rate limiting di `/auth/login`, `bcrypt`/`argon2` (lambat by design, tahan brute force) | `05-security-checklist.md` §1 |
| **T**ampering | Race condition mengubah `Account.balance` lewat request paralel (double-submit) | Row lock + atomic `$transaction` (Section 5.1 arsitektur) **+ Idempotency-Key** untuk retry jaringan (Section 4 backend guide) | `03-backend-guide.md` §4a |
| **T**ampering | CSRF — request state-changing dikirim diam-diam dari situs lain, memanfaatkan cookie yang otomatis terlampir | Access token via `Authorization` header (imun CSRF secara natural) + refresh/logout (satu-satunya endpoint cookie-based) pakai double-submit CSRF token (Section 8.5 arsitektur) | `01-architecture.md` §8.5 |
| **I**nformation Disclosure | IDOR — `GET /transactions/:id` milik bisnis lain diakses dengan menebak ID | Setiap query scoped `businessId` dari token, bukan cuma cek ID exist (Section 2 checklist) | `05-security-checklist.md` §2 |
| **I**nformation Disclosure | Error message bocorkan detail internal (stack trace, nama tabel) | `GlobalExceptionFilter` selalu translate ke pesan awam, tidak pernah lempar error asli ke client (Section 3 backend guide) | `03-backend-guide.md` §3 |
| **D**enial of Service | Endpoint upload/export dibanjiri request, menghabiskan worker capacity **atau kuota OCR bersama semua klien** | Rate limiting khusus per endpoint berat (Section 7 checklist) — untuk OCR ini **lebih kritis** dari DoS biasa karena dampaknya lintas klien | `05-security-checklist.md` §7 |
| **E**levation of Privilege | `STAFF` akses endpoint `OWNER`-only lewat manipulasi request langsung (bukan lewat UI) | `RolesGuard` di level backend untuk **setiap** endpoint sensitif, tidak ada yang "lupa" (Section 5 backend guide) | `03-backend-guide.md` §5 |
| **R**epudiation | User klaim "saya tidak pernah menghapus transaksi ini" | `AuditLog` immutable, append-only, `userId` tercatat (Section 4.4 arsitektur) | `01-architecture.md` §4.4 |

### 3.3 Railway — BullMQ Worker

| STRIDE | Skenario | Mitigasi | Referensi |
|---|---|---|---|
| **T**ampering | Job retry menghasilkan duplikasi (dua `Transaction` dari satu struk yang sama) | Job idempotent pakai `ImportBatchItem.id` sebagai key (Section 7 backend guide) | `03-backend-guide.md` §7 |
| **I**nformation Disclosure | Log job berisi data sensitif (isi struk, saldo) ter-log ke sistem eksternal (Sentry dkk) | Log scrubbing eksplisit sebelum kirim ke error tracking (Section 8 checklist) | `05-security-checklist.md` §8 |

### 3.4 Supabase — PostgreSQL

| STRIDE | Skenario | Mitigasi | Referensi |
|---|---|---|---|
| **T**ampering | SQL Injection lewat input user yang tidak divalidasi | Prisma parameterized query by default; `$queryRaw` **wajib** tagged template, tidak pernah string concat manual | `05-security-checklist.md` §3 |
| **I**nformation Disclosure | Backup/snapshot database bocor (misC akses tidak sengaja publik) | Supabase PITR terkelola vendor, akses dibatasi kredensial per-klien (Section 7.2 arsitektur) | `01-architecture.md` §7.2 |
| **D**enial of Service | Query tanpa index/pagination bikin database lambat/timeout saat data besar | Index wajib di kolom filter umum, pagination wajib di list endpoint (Section 6 backend guide) | `03-backend-guide.md` §6 |

### 3.5 Cloudinary — Foto Struk/Dokumen

| STRIDE | Skenario | Mitigasi | Referensi |
|---|---|---|---|
| **T**ampering | Upload file berbahaya menyamar sebagai gambar (misal SVG berisi script, atau file executable di-rename `.jpg`) | Validasi MIME **dan** magic bytes (bukan cuma ekstensi filename), tolak SVG untuk foto struk (Section 3 checklist) | `05-security-checklist.md` §3 |
| **I**nformation Disclosure | Asset Cloudinary bisa diakses publik tanpa otorisasi kalau URL ditebak | Signed URL masa berlaku pendek, bukan public asset (Section 6 checklist) | `05-security-checklist.md` §6 |
| **D**enial of Service | Upload file raksasa berulang menghabiskan kuota/biaya Cloudinary | Limit ukuran file divalidasi **sebelum** upload (client & server), rate limit endpoint upload | `05-security-checklist.md` §3, §7 |

### 3.6 Upstash Redis — Quota Service Terpusat (Section 6.3 arsitektur)

**Ini komponen paling perlu perhatian ekstra** karena **satu-satunya titik yang sengaja dibagi lintas semua klien** — beda dari komponen lain yang terisolasi per klien.

| STRIDE | Skenario | Mitigasi | Referensi |
|---|---|---|---|
| **T**ampering | Satu deployment klien yang credential-nya bocor bisa manipulasi counter kuota, merugikan klien lain (misal reset counter supaya provider "kelihatan" masih ada kuota padahal sudah habis, atau sebaliknya sengaja habiskan kuota klien lain) | Kredensial Quota Service **terpisah** dari kredensial per-klien lain, akses dibatasi hanya ke operasi `INCR`/`GET` pada key `ocr_quota:*` (bukan akses Redis penuh), disimpan sebagai secret khusus (Section 5 checklist) | `05-security-checklist.md` §5 |
| **D**enial of Service | Quota Service down/unreachable menghentikan OCR **semua klien sekaligus** — ini blast radius terbesar di seluruh sistem karena satu titik ini menyentuh semua klien | **Fail-open by design** (Section 6.3 arsitektur) — worker tetap jalan asumsi kuota aman kalau service unreachable, bukan fail-closed | `01-architecture.md` §6.3 |
| **I**nformation Disclosure | Data yang tersimpan di Quota Service **hanya counter angka per provider per bulan** — secara desain tidak ada data bisnis/finansial klien mana pun yang tersentuh komponen ini | Dipastikan lewat desain skema (key `ocr_quota:{provider}:{yyyy-mm}` saja, tidak ada `businessId`) — bukan kontrol tambahan, tapi keputusan desain yang menghilangkan risiko ini dari awal | `01-architecture.md` §6.3 |

### 3.7 Provider OCR Pihak Ketiga (Mindee, Azure, dst.)

| STRIDE | Skenario | Mitigasi | Referensi |
|---|---|---|---|
| **I**nformation Disclosure | Foto struk (berisi info bisnis) dikirim ke pihak ketiga di luar kendali kita | Tidak bisa dihindari (perlu untuk fitur OCR), tapi dibatasi hanya provider dengan kebijakan privasi jelas, tidak sembarang provider ditambahkan tanpa evaluasi (Section 7 brief non-negosiabel: dependency baru butuh alasan eksplisit) | `00-project-constitution.md` §7 |
| **T**ampering | Provider mengembalikan hasil parsing yang salah/dimanipulasi | **Prinsip non-negosiabel paling fundamental brief ini**: hasil OCR wajib direview manusia sebelum commit — desain ini sudah mengasumsikan provider tidak 100% dipercaya | `00-project-constitution.md` §4 |

### 3.8 CI/CD Pipeline

| STRIDE | Skenario | Mitigasi | Referensi |
|---|---|---|---|
| **T**ampering | Dependency NPM berbahaya masuk lewat supply-chain attack | Dependency audit di CI (`npm audit`/Snyk), evaluasi reputasi sebelum tambah dependency baru (Section 9 checklist) | `05-security-checklist.md` §9 |
| **I**nformation Disclosure | Secret production bocor lewat log CI atau env yang salah scope | Secret disimpan di secret manager platform (GitHub Actions secrets/Railway/Vercel env), tidak pernah di-echo ke log | `05-security-checklist.md` §5 |

---

## 4. Top 5 Risiko Prioritas (Ranked)

Diurutkan estimasi (kemungkinan × dampak), bukan cuma dampak — supaya effort keamanan dialokasikan ke tempat yang paling bernilai dulu:

| # | Risiko | Kenapa prioritas tinggi | Status mitigasi |
|---|---|---|---|
| 1 | Credential stuffing / brute force login | Paling sering terjadi di dunia nyata (bot otomatis, bukan serangan tertarget), dampak = akses penuh ke data finansial satu bisnis | ✅ Rate limit + hashing kuat (Section 3.2) |
| 2 | IDOR (akses data bisnis lain lewat ID tebakan) | Kesalahan implementasi yang sering luput saat development cepat ("vibe coding" tanpa disiplin), dampak = kebocoran data finansial lintas bisnis | ✅ Scoping wajib per-query (Section 3.2), **tapi butuh disiplin konsisten di SETIAP endpoint baru — ini risiko yang paling bergantung pada kepatuhan proses, bukan sekali-pasang kontrol** |
| 3 | Quota Service jadi single point of failure lintas-klien | Blast radius terbesar di seluruh sistem — satu-satunya komponen yang menyentuh semua klien sekaligus | ✅ Fail-open design (Section 3.6), kredensial dibatasi scope |
| 4 | CSRF di endpoint refresh/logout (karena FE-BE cross-origin) | Konsekuensi dari keputusan arsitektur hosting (Vercel+Railway beda domain) — bukan bug, tapi butuh desain sadar | ✅ Double-submit token (Section 3.2), **wajib diimplementasi benar, bukan cuma didokumentasikan** |
| 5 | Race condition saldo akun | Karakteristik inheren aplikasi finansial dengan potensi multi-device (Section 5.4 arsitektur) | ✅ Row lock + atomic transaction (Section 3.2) + Idempotency-Key untuk lapis tambahan |

---

## 5. Risiko yang Diterima (Residual Risk — Bukan Diabaikan Tanpa Sadar)

Kejujuran penting di sini — tidak ada sistem yang 100% aman, dan pura-pura begitu justru berbahaya:

- **Access token in-memory tetap punya window exposure ke XSS** selama masa hidup token (Section 5 backend guide) — mitigasi CSP mengurangi *kemungkinan* XSS terjadi, tapi tidak menghilangkan risiko 100% kalau ada celah XSS lain yang lolos. Ini kenapa masa hidup access token dibuat pendek (15 menit) — membatasi *window*, bukan menghilangkan risiko.
- **Kredensial API OCR bersama berarti satu klien "buruk" (misal disusupi) berpotensi menghabiskan kuota bersama** lebih cepat dari wajar — rate limit per-klien di level worker mengurangi ini, tapi tidak menghilangkan total selama arsitekturnya memang shared-key (Section 6.1 arsitektur, keputusan sadar demi efisiensi biaya).
- **Ketergantungan pada keamanan vendor pihak ketiga** (Vercel, Railway, Supabase, Cloudinary, Upstash, provider OCR) — kita mempercayai kontrol keamanan mereka, hanya bisa mitigasi lewat pemilihan vendor reputable dan least-privilege access ke tiap layanan.

## 6. Kapan Threat Model Ini Perlu Direvisi

- Setiap kali ada komponen shared infrastructure baru ditambahkan (mengikuti pola Quota Service) — evaluasi ulang blast radius-nya.
- Setiap kali model hosting berubah (misal dari "satu deployment per klien" jadi multi-tenant beneran di satu instance) — ini mengubah keseluruhan Section 2 & 3 secara fundamental.
- Setiap penambahan provider pihak ketiga baru yang menyentuh data finansial/foto user.
- Idealnya juga ditinjau ulang berkala (misal tiap 6 bulan) sebagai bagian dari Periodic Drift Audit (`07-ai-agent-workflow.md` Section 6) — bukan cuma dokumen sekali-tulis.

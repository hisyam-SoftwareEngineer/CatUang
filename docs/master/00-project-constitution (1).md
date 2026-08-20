# 00 — Project Constitution
## UMKM Finance Tracker

> File paling penting. AI WAJIB baca ini di awal setiap sesi. Semua file `01`–`08` adalah turunan/detail dari prinsip di sini — kalau ada konflik, file ini menang.
>
> **Riwayat Revisi:**
> - v1.0 — Draft awal
> - v1.1 — Revisi berdasarkan analisis relevansi UMKM Indonesia: (1) multi-currency jadi
>   fitur opsional bukan core, (2) model hosting berubah ke multi-tenant SaaS sebagai
>   default, (3) WhatsApp Bot masuk sebagai channel input resmi, (4) model revenue
>   bank/fintech masuk sebagai roadmap future.

---

## 1. Apa Project Ini
Platform pencatatan keuangan untuk pelaku UMKM Indonesia yang bisa diakses lewat
**web app** maupun **WhatsApp Bot** — membantu mencatat uang masuk/keluar dan
menyajikan laporan laba-rugi & posisi aset sederhana, tanpa perlu paham istilah
akuntansi formal.

**Dua channel, satu database:**
- **Web app** (Next.js) — dashboard lengkap, laporan, export, pengaturan
- **WhatsApp Bot** — input cepat harian via chat WA, dibangun setelah web core selesai

## 2. Target User
Pemilik UMKM awam akuntansi, mayoritas **usaha mikro** (omzet < Rp 300 juta/tahun,
97,8% dari 65,4 juta UMKM Indonesia per data BPS 2023). Berlaku untuk UI, pesan error,
DAN penamaan konsep di kode/dokumentasi bisnis — gunakan "Untung/Rugi" bukan "P&L",
"Uang Masuk/Keluar" bukan "Debit/Kredit".

**Implikasi desain:** Default experience diasumsikan IDR-only, single currency,
input manual. Fitur advanced (multi-currency, OCR, export XLSX) tersedia tapi
tidak mengganggu user yang tidak butuh.

## 3. Non-Goals (Sengaja Tidak Dikerjakan)
- Bukan software akuntansi lengkap (no general ledger/chart of account rigid)
- Bukan payment gateway
- Bukan sistem POS
- Multi-currency **bukan fitur default** — opsional, diaktifkan OWNER lewat Settings
  (lihat Section 4 & `01-architecture.md` Section 4.6). Default: IDR-only.

## 4. Prinsip Non-Negosiabel
- **Monolith modular** — tidak dipecah microservices kecuali kriteria di
  `01-architecture.md` Section 10.5 terpenuhi.
- Uang selalu `Decimal`, tidak pernah `Float`/`Number`.
- **Skema database selalu menyimpan `currency` eksplisit** (ISO 4217) di setiap kolom
  uang — ini keputusan skema yang tidak berubah. Yang berubah adalah **UI/UX**:
  kalau `enableMultiCurrency = false` (default), field currency tidak ditampilkan ke
  user dan diasumsikan IDR. Kalau `true`, UI tampilkan selector currency.
- **Exchange rate yang dipakai di transaksi/laporan gabungan wajib disimpan & ditampilkan
  eksplisit** — berlaku hanya saat multi-currency diaktifkan.
- Tidak ada `any` di TypeScript.
- Semua env var divalidasi (Zod) saat startup — fail-fast, bukan gagal diam-diam.
- Tidak ada business logic di controller/komponen UI — selalu di service layer.
- Tidak ada hardcoded credential.
- Setiap perubahan `Account.balance` wajib atomik (`$transaction` + row lock).
- Hasil OCR wajib direview manusia sebelum commit ke `Transaction` — tidak ada auto-commit.
- Semua opsi konfigurasi sistem (SSE, provider OCR, format export, multi-currency)
  bisa diatur `OWNER` lewat Settings, bukan hardcoded.
- **Karena frontend (Vercel) dan backend (Railway) beda domain, endpoint yang bergantung
  pada cookie (`/auth/refresh`, `/auth/logout`) wajib pakai CSRF protection eksplisit**
  (double-submit token).
- Semua endpoint API di-prefix versi (`/api/v1/...`) sejak endpoint pertama dibuat.
- **WhatsApp Bot adalah channel input, bukan sistem terpisah.** Bot memanggil
  `TransactionService` yang sama — tidak ada duplikasi business logic di modul bot.
- **`businessId` di semua tabel adalah non-negosiabel** — ini fondasi untuk
  multi-tenant (Section 6) dan future roadmap revenue model (Section 9).

## 5. Tech Stack Final

| Layer | Pilihan | Catatan |
|---|---|---|
| Frontend | Next.js + TypeScript | Web app (dashboard, laporan, settings) |
| Backend | NestJS + TypeScript | — |
| ORM | Prisma | Jangan ganti ke TypeORM dkk |
| Database | PostgreSQL (Supabase managed) | Multi-tenant via RLS + businessId |
| Queue | BullMQ + Redis | — |
| Auth | Passport JWT (hybrid token) | Access token in-memory, refresh di httpOnly cookie |
| Storage foto/dokumen | Cloudinary | — |
| Hosting FE | Vercel | — |
| Hosting BE | Railway (API + Worker + Redis) | — |
| OCR | Multi-provider: Mindee, Azure, OCR.space, Google Vision, Tesseract | Opsional, diatur via Settings |
| **WhatsApp Bot** | **WhatsApp Business API (Meta) + NestJS webhook module** | **Dibangun Phase 2+, free tier 1.000 conv/bulan** |

## 6. Model Hosting & Deployment

**Multi-tenant SaaS sebagai default (direvisi dari v1.0):**

| Tier | Model | Target |
|---|---|---|
| **Gratis / Standard** | **Multi-tenant** — satu instance Railway + satu Supabase project melayani banyak UMKM, isolasi via Row Level Security (RLS) + `businessId` scoping | Mayoritas UMKM mikro & kecil |
| **Premium** | Single-tenant dedicated — Railway project + Supabase project sendiri per klien | UMKM menengah yang butuh isolasi penuh, SLA khusus, atau custom domain |

**Alasan perubahan dari single-tenant-default:** 1 UMKM = 1 Railway deployment
tidak scalable secara operasional untuk ratusan ribu klien. `businessId` yang sudah
ada di semua tabel adalah fondasi yang tepat untuk multi-tenant.

**Keamanan multi-tenant adalah non-negosiabel:** RLS di Supabase wajib di-test
menyeluruh sebelum go-live. Kebocoran data antar tenant jauh lebih serius dari
bug biasa — lihat `08-threat-model.md` Section 3.9 (akan ditambahkan).

**API key provider OCR:** tetap dibagi bersama lintas semua klien (efficiency),
dikelola via Quota Service terpusat (`01-architecture.md` Section 6.3).

## 7. Kalau Instruksi Tidak Jelas
1. Cek apakah bertentangan dengan Section 4 — kalau iya, berhenti, konfirmasi ke user.
2. Kalau tidak bertentangan tapi butuh keputusan desain baru, pilih opsi paling
   sederhana konsisten dengan pola existing, jelaskan asumsi di ringkasan kerja.
3. Jangan tambah dependency baru tanpa alasan eksplisit ke user.
4. Keputusan berulang/signifikan wajib di-update ke file master yang relevan.

## 8. Peta Dokumen Lain

| File | Isi |
|---|---|
| `01-architecture.md` | High-level architecture lengkap: modul, skema data, alur kritis, hosting, roadmap |
| `02-frontend-guide.md` | Konvensi Next.js, komponen, state management |
| `03-backend-guide.md` | Konvensi NestJS, struktur modul, database rules |
| `04-coding-standards.md` | Linting, naming, testing, self-check checklist |
| `05-security-checklist.md` | Checklist keamanan wajib per area |
| `06-api-contract.md` | Living document daftar endpoint (update tiap PR) |
| `07-ai-agent-workflow.md` | Cara kerja & pengawasan AI coding agent |
| `08-threat-model.md` | Analisis STRIDE — skenario serangan realistis per komponen & prioritas mitigasi |

## 9. Roadmap Revenue Model (Future)

Dicatat di sini untuk memastikan keputusan arsitektur sekarang tidak memblokir
implementasi di masa depan:

**Saat ini:** App gratis, biaya operasional ditanggung developer/investor.

**Fase scale (setelah 100.000 UMKM aktif dengan 6+ bulan data):**
- Model C2: Jual credit scoring API ke bank/fintech — UMKM dapat app gratis,
  bank dapat data untuk keputusan KUR, dengan consent eksplisit dari user.
- Prasyarat teknis: consent management module, data anonymization pipeline,
  comply dengan UU PDP No. 27/2022.
- Detail lengkap: `docs/idea/02-bank-data-model.md`

**Yang sudah disiapkan dari sekarang:** `businessId` di semua tabel, soft delete
jaga histori transaksi, skema data yang memungkinkan agregasi anonim.
**Yang TIDAK dibangun sekarang:** consent module, scoring API, partnership bank.

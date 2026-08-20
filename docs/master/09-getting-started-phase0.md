# 09 — Getting Started: Phase 0 Backend Bootstrap
## UMKM Finance Tracker

> File ini beda dari file `docs-master` lain — bukan aturan permanen, tapi **panduan sekali-pakai** untuk memulai coding backend pertama kali. Setelah Phase 0 selesai, file ini jadi arsip referensi (opsional dipertahankan untuk onboarding developer baru nanti).

---

## Bagian A — Persiapan Akun (Lakukan Ini SEBELUM Buka AI Agent)

Pendekatan: **local dev tanpa Docker**, pakai tier gratis cloud provider supaya laptop ringan dan tetap Rp0 di tahap ini.

### A.1 Buat Project Supabase Gratis (Postgres untuk Dev)

1. Daftar di [supabase.com](https://supabase.com) (tanpa kartu kredit)
2. Buat project baru, beri nama jelas: **`umkm-finance-tracker-dev`** (supaya tidak tertukar nanti dengan project Staging/Production yang beda tier)
3. Simpan **Connection String** (Settings → Database → Connection String → mode `URI`, pilih yang **pooler** untuk koneksi dari aplikasi) — ini yang jadi `DATABASE_URL`
4. **Catatan yang perlu Anda ingat:** project gratis ini auto-pause kalau tidak ada aktivitas 7 hari. Kalau nanti Anda cek dan project "tertidur", tinggal buka dashboard Supabase dan klik resume — datanya tidak hilang.

### A.2 Buat Database Upstash Gratis (Redis untuk BullMQ Dev)

1. Daftar di [upstash.com](https://upstash.com) (tanpa kartu kredit)
2. Buat Redis database baru, beri nama: **`umkm-finance-tracker-dev`**
3. Simpan connection string `rediss://...` (perhatikan **`rediss` pakai dua-s**, itu bukan typo — artinya TLS, wajib dipakai untuk Upstash) — ini jadi `REDIS_URL`

### A.3 Kumpulkan Semua Env Var di Satu Tempat

Sebelum buka AI Agent, siapkan nilai-nilai ini (jangan ditaruh di chat AI langsung, taruh di file `.env` lokal yang **tidak** ter-commit ke git):

```bash
# .env (LOKAL, jangan commit — pastikan .gitignore sudah benar)
DATABASE_URL="postgresql://...dari Supabase A.1..."
REDIS_URL="rediss://...dari Upstash A.2..."
JWT_ACCESS_SECRET="generate string acak panjang, misal: openssl rand -base64 32"
JWT_REFRESH_SECRET="generate string acak panjang BEDA dari access secret"
CSRF_SECRET="generate string acak panjang lain lagi"
NODE_ENV="development"
PORT="3000"
ALLOWED_ORIGIN="http://localhost:3001"
```

**Belum perlu disiapkan sekarang** (baru dibutuhkan Phase 2+): Cloudinary, provider OCR (Mindee dkk), Upstash Quota Service terpisah, Railway, Vercel.

---

## Bagian B — Spec Siap Pakai untuk AI Agent

Paste blok ini ke AI Agent (Claude Code/Cursor/dsb) sebagai **pesan pertama** di sesi baru, setelah `.env` di Bagian A sudah siap dan `docs-master/` sudah ada di repo.

```markdown
## Spec: Phase 0 — Bootstrap Backend NestJS + Prisma

### Konteks
Sebelum coding, baca dulu secara berurutan:
1. docs-master/00-project-constitution.md
2. docs-master/01-architecture.md (fokus Section 3, 4, 6.4)
3. docs-master/03-backend-guide.md
4. docs-master/04-coding-standards.md

### Requirement
Bootstrap struktur project backend NestJS + Prisma yang terhubung ke
Supabase (Postgres) dan Upstash (Redis) via env var — TIDAK pakai Docker,
TIDAK pakai docker-compose. Koneksi database langsung ke cloud provider
yang sudah saya siapkan di .env.

### Acceptance Criteria
- [ ] Project NestJS baru di `apps/api/` sesuai struktur modul di
      03-backend-guide.md Section 1
- [ ] Prisma terpasang, `schema.prisma` berisi model dasar sesuai
      01-architecture.md Section 4.2 & 4.6: Business, User (dengan role
      OWNER/STAFF), Account (dengan currency), Category, Transaction
      (dengan currency, exchangeRateUsed), ExchangeRate, AuditLog
      — SEMUA kolom uang wajib Decimal + currency eksplisit, TIDAK ADA
      pengecualian, sesuai prinsip non-negosiabel constitution
- [ ] Migration pertama berhasil jalan ke Supabase (DATABASE_URL dari .env)
- [ ] Validasi env var pakai Zod di startup (03-backend-guide.md Section 8)
      — aplikasi WAJIB gagal start dengan pesan jelas kalau salah satu
      env var wajib tidak ada
- [ ] BullMQ terhubung ke Upstash (REDIS_URL dari .env, ingat protokol
      rediss:// bukan redis://) — buat satu queue kosong dulu
      (`ocr-processing`) sebagai bukti koneksi jalan, belum perlu ada
      job nyata
- [ ] Helmet terpasang sebagai global middleware (03-backend-guide.md
      Section 10)
- [ ] API versioning `/api/v1` aktif dari endpoint pertama
      (03-backend-guide.md Section 9)
- [ ] Satu endpoint health check `GET /api/v1/health` yang mengecek
      koneksi Postgres DAN Redis, bukan cuma "server hidup"
- [ ] README.md singkat: cara jalankan project lokal (`npm install`,
      `npm run start:dev`), TANPA instruksi Docker

### File yang Disentuh
- Seluruh isi apps/api/ (project baru, belum ada apa-apa)
- prisma/schema.prisma
- .env.example (TANPA nilai asli, cuma nama variabel)
- README.md

### Di Luar Scope Spec Ini (Jangan Dikerjakan Dulu)
- Auth/login (spec terpisah setelah ini)
- Cloudinary, provider OCR — belum ada kredensialnya
- Deploy ke Railway/Vercel — belum tahap ini

### Setelah Selesai
Jalankan self-check sesuai 04-coding-standards.md Section 7 sebelum
melapor selesai. Tunjukkan bukti: hasil `npx prisma migrate dev` sukses,
dan response `GET /api/v1/health`.
```

---

## Bagian C — Urutan Spec Berikutnya (Setelah Phase 0 Bootstrap Sukses)

Jangan minta semua sekaligus. Satu spec = satu concern, sesuai `07-ai-agent-workflow.md` §2:

1. ✅ **Phase 0**: Bootstrap (spec di atas)
2. **Auth module**: register, login, refresh (hybrid token + CSRF), logout — rujuk `03-backend-guide.md` Section 5 & `06-api-contract.md`
3. **Account module**: CRUD akun dengan currency (whitelist 7 currency, `01-architecture.md` §4.6)
4. **Category module**: CRUD kategori + default template
5. **Transaction module**: catat MASUK/KELUAR/TRANSFER, termasuk Idempotency-Key (`03-backend-guide.md` §4a) dan row lock (`01-architecture.md` §5.1)
6. **Report module**: agregasi Untung/Rugi mode Per-Currency & Gabungan (`01-architecture.md` §5.3)

Tiap spec baru: buka sesi baru atau minta AI baca ulang `docs-master/` dulu — jangan asumsikan AI "masih ingat" dari sesi sebelumnya kalau context window sudah panjang/reset.

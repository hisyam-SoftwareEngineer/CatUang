# 04 — Coding Standards
## UMKM Finance Tracker

> Checklist di file ini dipakai AI untuk **self-check** setelah generate kode, dan dipakai reviewer (manusia/AI) untuk **review gate** sebelum merge. Setiap poin harus bisa dijawab ya/tidak — kalau tidak bisa dicek objektif, tidak masuk file ini.

---

## 1. Linting & Formatting (Automated, Non-Negotiable)

- ESLint + Prettier dijalankan otomatis lewat pre-commit hook (Husky + lint-staged) — kode yang melanggar **tidak bisa** ter-commit, bukan sekadar warning.
- TypeScript `strict: true` di `tsconfig.json` untuk FE & BE — tidak ada pengecualian per-file tanpa alasan tertulis.
- Import diurutkan otomatis (built-in → external → internal → relative) via plugin, bukan manual.

## 2. Naming Convention

| Elemen | Konvensi | Contoh |
|---|---|---|
| File komponen React | `PascalCase.tsx` | `TransactionForm.tsx` |
| File service/util lain | `kebab-case.ts` | `format-currency.ts` |
| Class | `PascalCase` | `TransactionService` |
| Function/variable | `camelCase` | `calculateBalance` |
| Konstanta global | `SCREAMING_SNAKE_CASE` | `MAX_UPLOAD_SIZE_MB` |
| Enum | `PascalCase` (nama), `UPPER_CASE` (value) | `TransactionType.MASUK` |
| Database table/column (Prisma) | `PascalCase` model, `camelCase` field | `model Transaction { accountId ... }` |

## 3. Komentar & Dokumentasi Minimum

- **Kapan wajib komentar:** logic yang tidak jelas dari nama function saja (misal kalkulasi finansial dengan rounding khusus, alasan pakai row-lock) — jelaskan **kenapa**, bukan **apa** (kode sudah menjelaskan "apa").
- **Kapan tidak perlu komentar:** function sederhana yang self-explanatory dari nama & tipe (`getAccountById(id: string)` tidak perlu komentar).
- Setiap service method public **wajib** JSDoc singkat kalau dipanggil dari modul lain (bagian dari kontrak antar-modul, Section 2 di `03-backend-guide.md`).
- Setiap `unknown` + type guard (pengganti `any`) **wajib** komentar alasan (sesuai prinsip non-negosiabel brief).

## 4. Testing Requirement

| Jenis file | Wajib test? | Jenis test |
|---|---|---|
| Service layer (business logic) | **Wajib** | Unit test, termasuk edge case (saldo tidak cukup, transaksi negatif) |
| Alur transaksi & transfer (Section 5.1 arsitektur) | **Wajib** | Test khusus untuk concurrent write / race condition |
| Controller | Opsional | Integration test untuk endpoint kritis (auth, transaksi, export) |
| Komponen React murni presentational | Opsional | Boleh dilewati kalau tidak ada logic |
| Custom hooks dengan logic | **Wajib** | Unit test |
| Util/pure function (`formatCurrency`, dll) | **Wajib** | Unit test — murah untuk ditest, sering jadi sumber bug kecil |

- Target coverage bukan angka arbitrer (misal "80%") tapi **coverage tinggi khusus di service layer finansial** — coverage rendah di komponen UI sederhana bisa diterima.

## 5. Struktur Commit & PR

- Commit message: `<type>(<scope>): <deskripsi>` — contoh `feat(transaction): tambah validasi saldo transfer`, `fix(export): perbaiki format tanggal PDF`.
- Satu PR = satu concern. PR yang mencampur fitur baru + refactor besar wajib dipecah.
- PR description **wajib** checklist Definition of Done (lihat `07-ai-agent-workflow.md`).

## 6. Dependency Management

- Dependency baru **wajib** disebutkan alasannya secara eksplisit ke user sebelum ditambahkan (sesuai prinsip brief Section 7) — AI tidak boleh diam-diam menambah library.
- Cek dulu apakah kebutuhan bisa diselesaikan dengan yang sudah ada di stack sebelum menambah dependency baru.
- Tidak ada dependency dengan lisensi tidak jelas atau maintenance yang sudah mati (>2 tahun tanpa update) tanpa diskusi eksplisit.

## 7. Self-Check Checklist (AI Menjalankan Ini Sebelum Melaporkan Tugas Selesai)

Sebelum bilang "sudah selesai", AI wajib cek ulang kodenya sendiri terhadap daftar ini:

- [ ] Tidak ada `any` di kode baru
- [ ] Tidak ada `console.log` yang tertinggal
- [ ] Semua angka uang pakai `Decimal`, bukan `number`/`float`
- [ ] Setiap field/kolom uang baru punya `currency` eksplisit yang divalidasi
- [ ] Business logic ada di service layer, bukan di controller/komponen UI
- [ ] Error message ke user dalam bahasa Indonesia awam
- [ ] Endpoint baru sudah update `06-api-contract.md`
- [ ] Kalau ada perubahan skema, migration Prisma sudah dibuat
- [ ] Kalau menyentuh `Account.balance`, sudah pakai `$transaction` + row lock
- [ ] Test baru ditambahkan sesuai Section 4 di atas
- [ ] Tidak ada dependency baru tanpa alasan tertulis
- [ ] **Setiap query ke tabel data bisnis sudah di-scope dengan `businessId` dari JWT, bukan dari request body** (multi-tenant rule — `03-backend-guide.md` Section 11)
- [ ] **Kalau menyentuh modul `whatsapp-bot`, tidak ada business logic di dalamnya** — hanya parse + panggil service existing
- [ ] **Kalau menambah/mengubah field di `BusinessSettings`, sudah update `06-api-contract.md` di endpoint `GET/PATCH /settings`**

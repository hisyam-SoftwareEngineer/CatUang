---
inclusion: always
---

# UMKM Finance Tracker — Master Rules (Auto-Injected)

> Steering file ini di-inject otomatis ke setiap sesi AI di workspace ini.
> AI WAJIB membaca dan mematuhi seluruh aturan di bawah sebelum melakukan aksi apapun — membuat file, mengubah kode, menjawab pertanyaan desain, atau memberikan rekomendasi.

---

## Dokumen Referensi Wajib

Ketiga dokumen berikut adalah **constraint aktif**, bukan sekadar dokumentasi pasif.
Kalau ada konflik antara instruksi user dan dokumen ini, **berhenti dan konfirmasi ke user** sebelum melanjutkan.

#[[file:docs/master/00-project-constitution (1).md]]

#[[file:docs/master/01-architecture (1).md]]

#[[file:docs/master/04-coding-standards.md]]

---

## Ringkasan Prinsip Non-Negosiabel (Quick Reference)

Poin-poin ini adalah extract dari `00-project-constitution.md` Section 4.
Selengkapnya ada di dokumen di atas — ini hanya pengingat cepat:

- **Monolith modular** — tidak ada pemecahan ke microservices tanpa persetujuan eksplisit
- **Uang = `Decimal`** — tidak pernah `Float` / `Number`
- **Setiap nilai uang wajib punya `currency` eksplisit** (ISO 4217) — tidak pernah diasumsikan IDR
- **Exchange rate wajib disimpan eksplisit** di row `Transaction`, bukan dihitung ulang dari tabel kurs terkini
- **Tidak ada `any` di TypeScript** — pakai `unknown` + type guard kalau terpaksa, dengan komentar alasan
- **Semua env var divalidasi Zod saat startup** — fail-fast, bukan diam-diam
- **Business logic hanya di service layer** — tidak di controller, tidak di komponen UI
- **Tidak ada hardcoded credential**
- **Setiap perubahan `Account.balance` wajib atomik** — `$transaction` + row lock
- **Hasil OCR wajib review manusia** sebelum commit ke `Transaction`
- **Semua endpoint di-prefix `/api/v1/`** sejak endpoint pertama dibuat
- **CSRF protection eksplisit** untuk `/auth/refresh` & `/auth/logout` (double-submit token)

---

## Self-Check Wajib Sebelum Melaporkan Tugas Selesai

Sebelum bilang "sudah selesai", AI wajib verifikasi semua poin ini dengan **bukti kutipan kode**, bukan cuma centang kosong:

- [ ] Tidak ada `any` di kode baru
- [ ] Tidak ada `console.log` yang tertinggal
- [ ] Semua angka uang pakai `Decimal`, bukan `number`/`float`
- [ ] Setiap field/kolom uang baru punya `currency` eksplisit yang divalidasi
- [ ] Business logic ada di service layer, bukan di controller
- [ ] Error message ke user dalam bahasa Indonesia awam
- [ ] Endpoint baru sudah update `docs/master/06-api-contract.md`
- [ ] Kalau ada perubahan skema, migration Prisma sudah dibuat
- [ ] Kalau menyentuh `Account.balance`, sudah pakai `$transaction` + row lock
- [ ] Test baru ditambahkan sesuai `docs/master/04-coding-standards.md` Section 4
- [ ] Tidak ada dependency baru tanpa alasan tertulis

---

## Kalau Instruksi Tidak Jelas

1. Cek apakah bertentangan dengan prinsip non-negosiabel di atas — kalau iya, **berhenti, konfirmasi ke user**
2. Kalau tidak bertentangan tapi butuh keputusan desain baru, pilih opsi paling sederhana yang konsisten dengan pola existing, jelaskan asumsi
3. Jangan tambah dependency baru tanpa alasan eksplisit ke user
4. Keputusan signifikan wajib di-update ke file master yang relevan — jangan biarkan hidup cuma di riwayat chat

# 02 — Frontend Guide
## UMKM Finance Tracker (Next.js)

> File ini adalah **constraint aktif**. AI coding agent WAJIB membaca file ini sebelum membuat/mengubah kode di `apps/web`. Kalau instruksi user bertentangan dengan file ini, AI harus berhenti dan konfirmasi dulu (lihat `00-project-constitution.md` Section 7).

---

## 1. Struktur Folder & Alasannya

```
apps/web/
  app/                    # Next.js App Router — routing & page composition SAJA
    (auth)/               # Route group: login, register
    (dashboard)/          # Route group: butuh auth
      transactions/
      reports/
      settings/
  components/
    ui/                   # Primitif reusable (Button, Input, Card) — tanpa business logic
    features/             # Komponen spesifik fitur (TransactionForm, ReportChart)
  lib/
    api/                  # Fetcher ke backend NestJS, satu file per modul (transactions.ts, accounts.ts)
    hooks/                # Custom hooks (useAccount, useSettings)
    utils/                # Pure function, tidak ada side effect
  types/                  # Shared TypeScript types (idealnya di-generate dari 06-api-contract.md)
```

**Aturan:** `app/**/page.tsx` **hanya boleh** compose komponen + fetch data. Tidak boleh ada kalkulasi bisnis (misal hitung total, validasi saldo) langsung di file `page.tsx` — itu tugas `lib/` atau backend.

---

## 2. Server Component vs Client Component

- **Default: Server Component.** Hanya tambahkan `"use client"` kalau butuh interaktivitas (onClick, useState, useEffect) — jangan taruh `"use client"` di level tinggi (misal seluruh `page.tsx`) kalau cuma satu tombol kecil yang butuh interaktif; pecah jadi komponen client kecil di dalamnya.
- Data fetching awal (initial load) **selalu** di Server Component — jangan fetch data di `useEffect` untuk data yang sudah bisa didapat saat render server.
- Form input transaksi (Section 5.1 di dokumen arsitektur) **boleh** client component karena butuh state form + validasi real-time.

## 3. Konvensi Komponen

- **Naming:** `PascalCase` untuk file & komponen (`TransactionForm.tsx`), `camelCase` untuk hooks (`useAccountBalance.ts`).
- **Satu komponen = satu file.** Tidak ada file `index.tsx` berisi banyak komponen tidak terkait, kecuali barrel export murni re-export.
- **Props selalu di-tipe eksplisit** dengan `interface`, tidak pernah `any` (konsisten dengan prinsip non-negosiabel brief).
- **Komponen di atas ~150 baris** = sinyal untuk dipecah. Ini bukan hard limit, tapi kalau AI generate komponen lebih panjang dari itu, wajib pertimbangkan pemisahan sub-komponen.

## 4. Bahasa & Istilah UI (Wajib, sesuai Section 2 brief)

- Gunakan istilah awam: **"Untung/Rugi"** bukan "P&L", **"Uang Masuk/Keluar"** bukan "Debit/Kredit", **"Punya Bisnis"** bukan "Aset", **"Utang Usaha"** bukan "Liabilitas" di label UI (istilah teknis boleh di kode/variable, tapi tidak boleh muncul ke user).
- Pesan error **selalu** dalam bahasa Indonesia yang jelas, tidak menampilkan stack trace atau kode error teknis ke user awam. Contoh benar: `"Saldo kas tidak cukup untuk transaksi ini"`. Contoh salah: `"Error 422: Unprocessable Entity"`.

## 5. State Management

- **Server state** (data dari API: transaksi, saldo, laporan): pakai data-fetching library dengan cache bawaan (misal TanStack Query) — jangan simpan di global state manual (Redux/Zustand) untuk data yang sumbernya server.
- **UI state lokal** (form terbuka/tertutup, tab aktif): `useState` biasa, tidak perlu global state.
- **Global state** (misal: data user login, `BusinessSettings` dari Section 6.2 arsitektur) — satu context/provider kecil, jangan taruh business logic di dalamnya, cuma penyimpanan.
- **Real-time sync (SSE, opsional sesuai Settings)**: dibungkus satu hook (`useRealtimeSync`) yang subscribe/unsubscribe otomatis berdasarkan `BusinessSettings.realtimeSyncEnabled` — komponen lain tidak perlu tahu detail SSE.
- **Access token** (pola hybrid, lihat `01-architecture.md` §8.5): disimpan di satu `AuthContext` (React state), **tidak pernah** di `localStorage`/`sessionStorage`. Fetcher di `lib/api/` (Section 1) pakai satu wrapper terpusat yang otomatis menambahkan header `Authorization: Bearer <token>` dari context ini — komponen individual tidak pernah handle token secara manual. Kalau request gagal `401`, wrapper otomatis panggil `/auth/refresh` sekali (cookie terkirim otomatis oleh browser), lalu retry request asli — kalau refresh juga gagal, baru redirect ke halaman login.

## 6. Styling & Design

- Konsisten satu pendekatan styling (Tailwind direkomendasikan untuk kecepatan + konsistensi) — **tidak boleh** campur inline style, CSS module, dan Tailwind di komponen berbeda tanpa alasan.
- Rujuk skill `frontend-design` untuk token warna/spacing/tipografi supaya hasil tidak terlihat "template AI generik" — penting untuk kesan *high-end* yang Anda minta.
- Semua angka uang **wajib** diformat pakai `Intl.NumberFormat(locale, { style: 'currency', currency })` lewat satu util function bersama (`lib/utils/formatCurrency.ts`) — **`currency` selalu parameter eksplisit dari data (`Account.currency`/`Transaction.currency`), tidak pernah di-hardcode `'IDR'`** sejak mendukung multi-currency native (lihat `01-architecture.md` Section 4.6). `locale` default `'id-ID'` untuk pemisah ribuan yang familiar user Indonesia walau currency-nya asing (misal `Rp` vs `$` tapi format angka tetap gaya Indonesia).

## 7. Error & Loading State

- Setiap komponen yang fetch data **wajib** handle 3 state: loading, error, empty — tidak boleh cuma handle "happy path".
- Loading state pakai skeleton, bukan spinner polos, untuk pengalaman yang terasa premium.

## 8. Accessibility (a11y) — Bukan Opsional

Target user brief ini (Section 2: pemilik UMKM awam, bisa saja usia lebih tua atau kurang terbiasa teknologi) membuat accessibility lebih dari sekadar checklist compliance — ini langsung mempengaruhi siapa yang **bisa pakai aplikasi ini sama sekali**:

- Semua elemen form (`input`, `select`) **wajib** punya `<label>` terasosiasi (`htmlFor`), tidak cukup `placeholder` saja — placeholder hilang saat user mulai mengetik, membingungkan user yang butuh waktu lebih lama membaca.
- Kontras warna teks-background minimal **WCAG AA** (rasio 4.5:1 untuk teks normal) — cek terutama di teks abu-abu muda yang sering dipakai untuk "hint text", area yang paling sering luput.
- Semua elemen interaktif (tombol, link) bisa dijangkau & dioperasikan via keyboard (`Tab`, `Enter`), dengan `focus state` yang terlihat jelas — jangan hilangkan `outline` default tanpa mengganti dengan alternatif yang sama jelasnya.
- Ikon-only button (tanpa teks label, misal tombol hapus berikon tong sampah) **wajib** `aria-label` deskriptif.
- Pesan error form (Section 4) terasosiasi ke input terkait lewat `aria-describedby`, bukan cuma teks merah yang berdiri sendiri secara visual.

## 9. Larangan Eksplisit

- Tidak ada `fetch()` langsung di komponen — selalu lewat `lib/api/*`.
- Tidak ada hardcoded URL API — selalu dari env var (`NEXT_PUBLIC_API_URL`).
- Tidak ada `console.log` yang ter-commit ke production build.
- Tidak ada business logic (kalkulasi saldo, validasi aturan bisnis) di frontend yang tidak divalidasi ulang di backend — frontend validation cuma untuk UX, backend tetap sumber kebenaran (sesuai prinsip non-negosiabel brief: "tidak ada business logic di controller/komponen UI").
- Tidak ada asumsi currency default `'IDR'` di komponen mana pun — selalu ambil dari data akun/transaksi yang sedang ditampilkan (Section 6 di atas).

# Kumpulan Ide Pengembangan UMKM Finance Tracker
## Dari Perspektif: "Kalau Punya Budget Tak Terbatas"

> Dokumen ini berisi semua opsi strategis yang dipertimbangkan untuk membuat proyek ini
> benar-benar relevan bagi 65 juta UMKM Indonesia. Disusun dari analisis data BPS, APJII,
> OJK, Kemenkop UKM, dan We Are Social 2022-2024.
>
> **Status per opsi:**
> - ✅ ADOPTED — sudah diputuskan masuk ke roadmap, lihat file master terkait
> - 🔄 FUTURE — masuk roadmap tapi belum diimplementasi, tunggu kondisi terpenuhi
> - 💡 OPEN — masih sebagai ide, belum ada keputusan

---

## OPSI A — Radikal Simplifikasi Produk

### A1. "Mode Warung" sebagai default UI 💡
Saat pertama buka app, tanya satu pertanyaan: *"Kamu jualan apa?"*. Berdasarkan jawaban,
sistem otomatis set kategori, template laporan, dan sembunyikan fitur yang tidak relevan.
User warung bakso tidak perlu lihat tombol "Multi-Currency" atau "Exchange Rate" sama sekali.

**Data pendukung:** 97,8% dari 65,4 juta UMKM adalah usaha mikro (BPS 2023) yang tidak
butuh fitur advanced.

**Effort:** Medium — perlu onboarding flow baru + conditional UI rendering.

---

### A2. WhatsApp Bot sebagai channel input alternatif ✅ ADOPTED
**Data:** 97 juta pengguna aktif WhatsApp di Indonesia (We Are Social 2024).
UMKM mikro lebih akrab ketik di WA daripada buka browser.

**Desain:**
- Bot WA terima pesan natural language: *"masuk 500rb dari jual nasi"*, *"keluar 200rb beli beras"*
- Bot parse → simpan ke database yang sama dengan web app
- Web app tetap ada sebagai "advanced mode" dan dashboard laporan
- Bot hanya jadi channel input tambahan, bukan pengganti

**Prioritas:** Dibangun setelah web app core selesai dan stabil.
**Kondisi gratis:** Gunakan Whatsapp Business API via provider yang punya free tier
(WABA via Meta langsung: 1.000 conversation/bulan gratis). Scale gratis selama
total conversation < 1.000/bulan per nomor bisnis. Evaluasi ulang saat mendekati limit.

**Lihat detail teknis:** `idea/01-whatsapp-bot.md`

---

### A3. Offline-first PWA 💡
67% akses internet via HP dengan koneksi tidak stabil (APJII 2023).
Buat versi PWA yang bisa input transaksi offline, sync otomatis pas ada internet.

**Blocker:** Membutuhkan perombakan signifikan di arsitektur frontend (service worker,
IndexedDB local store, conflict resolution). Masuk backlog Phase lanjutan.

---

## OPSI B — Distribusi & Akses

### B1. APK Android sideload 💡
Distribusi via APK langsung untuk HP entry-level tanpa Google account aktif.
Frontend dibungkus Capacitor/Expo.

### B2. Zero-rating dengan operator 💡
Kerjasama Telkom/Indosat supaya akses ke domain app tidak memakan kuota.
Butuh negosiasi korporat — feasible kalau sudah punya scale jutaan user.

### B3. Integrasi ke ekosistem yang sudah ada (GoPay, Tokopedia, BRImo) 💡
Mini app di dompet digital atau seller center marketplace.
Butuh partnership korporat dan API dari masing-masing platform.

### B4. Kios fisik di pasar tradisional 💡
Stan dengan tablet di pasar besar. Cocok untuk UMKM tanpa HP canggih.
Model operasional berbeda — bukan software play tapi service play.

---

## OPSI C — Model Bisnis

### C1. Gratis berdasarkan omzet yang di-declare 💡
Di bawah Rp 300 juta/tahun: gratis total. Di atas itu mulai bayar.
Align dengan definisi usaha mikro Kemenkop UKM.

---

### C2. Revenue dari bank/fintech, bukan dari UMKM 🔄 FUTURE
**Data:** OJK 2023 — 60% UMKM gagal akses KUR karena tidak punya laporan keuangan.
Bank sangat butuh data transaksi UMKM untuk credit scoring tapi tidak punya akses.

**Model:**
- UMKM dapat app gratis
- Data transaksi agregat (anonim, dengan consent eksplisit) dijual ke bank/fintech
  sebagai credit scoring signal
- Atau: fee referral dari KUR yang berhasil cair karena laporan dari app ini

**Kondisi aktivasi:** Minimal 100.000 UMKM aktif dengan data transaksi 6+ bulan.
Di bawah threshold itu, data tidak cukup representatif untuk dijual ke bank.

**Implikasi ke arsitektur:** Butuh consent management module, data anonymization
pipeline, dan partnership API ke bank. Tidak dibangun sekarang, tapi skema data
harus memungkinkan ini di masa depan (businessId sudah ada untuk future-proofing).

**Lihat detail:** `idea/02-bank-data-model.md`

---

### C3. Fee dari KUR yang berhasil cair 🔄 FUTURE
0,5-1% dari nilai pinjaman sebagai referral fee dari bank.
KUR 2023: Rp 260 triliun total penyaluran.
Kondisi: butuh kerjasama formal dengan bank penyalur KUR (BRI, BNI, Mandiri).

### C4. Lisensi enterprise ke konglomerat (Alfamart, Indomaret) 💡
Jual ke jaringan yang sudah punya ratusan ribu mitra UMKM.

---

## OPSI D — Perombakan Teknis

### D1. Multi-currency jadi plugin opsional, bukan core ✅ ADOPTED
**Data:** Hanya ~4,1% UMKM Indonesia yang berorientasi ekspor (BPS 2022).
95,9% tidak butuh multi-currency.

**Keputusan:**
- Default: IDR-only, semua UI/UX diasumsikan IDR
- Multi-currency: modul opsional, aktif HANYA kalau OWNER set `enableMultiCurrency: true`
  di Settings
- Kalau disabled, field `currency` tetap ada di database (IDR hardcoded), tapi
  tidak muncul di UI sama sekali
- Ini tidak breaking change ke skema — data model tetap sama, hanya presentation layer
  dan validasi yang berubah berdasarkan setting

**Lihat perubahan di:** `00-project-constitution.md`, `01-architecture.md`

---

### D2. Multi-tenant SaaS sebagai model default, single-tenant sebagai premium ✅ ADOPTED
**Masalah sekarang:** 1 UMKM = 1 Railway project + 1 Supabase project.
Scale ke 10.000 klien = manage 10.000 deployment. Tidak operasional.

**Keputusan:**
- **Tier Gratis/Standard:** Multi-tenant SaaS — satu instance melayani banyak UMKM,
  isolasi via Row Level Security (RLS) di Supabase + `businessId` scoping yang sudah ada
- **Tier Premium:** Single-tenant dedicated deployment — untuk UMKM menengah/besar
  yang butuh isolasi penuh, SLA khusus, atau custom domain

**Kondisi migrasi:**
- Multi-tenant dibangun dari awal sebagai default
- Single-tenant tetap ada sebagai opsi deployment manual untuk klien premium
- `businessId` yang sudah ada di semua tabel adalah fondasi yang tepat untuk ini

**Implikasi keamanan:** RLS di Supabase wajib ditest secara menyeluruh —
kebocoran data antar tenant di multi-tenant jauh lebih serius dari bug biasa.

**Lihat perubahan di:** `01-architecture.md`

---

### D3. Sederhanakan OCR pipeline 💡
Ganti 5-provider OCR + Quota Service dengan satu provider saja (Gemini Vision free tier)
untuk MVP. Multi-provider fallback bisa datang setelah ada data usage nyata.

### D4. Voice input 💡
Google Speech-to-Text free tier (60 menit/bulan) untuk input suara.
*"uang masuk lima ratus ribu dari jual ayam"* → parse → konfirmasi → simpan.

---

## OPSI E — Ekosistem & Edukasi

### E1. Tutorial interaktif embedded di app 💡
Guided onboarding flow bukan link ke YouTube.

### E2. Program UMKM Ambassador 💡
Bayar pemilik warung sukses untuk onboard tetangganya.
10.000 ambassador × Rp 500rb/bulan = Rp 5 miliar/bulan.

### E3. Kerjasama Dinas Koperasi & UMKM 💡
514 kabupaten/kota punya program pembinaan UMKM tapi tidak punya tools digital.

---

## OPSI F — Visi Jangka Panjang

### F1. Credit bureau alternatif untuk UMKM 🔄 FUTURE
Credit scoring dari data transaksi 12+ bulan. Feasible setelah punya 10 juta user aktif.

### F2. Marketplace supply chain 💡
Connect warung ke supplier terbaik berdasarkan pola pembelian. Playbook Tokopedia B2B.

### F3. Asuransi mikro berbasis data transaksi 💡
Premi dihitung dari volatilitas pendapatan yang tercatat.

---

## Prioritas yang Diputuskan (Jangka Pendek)

| Prioritas | Opsi | Alasan |
|---|---|---|
| 1 | **D1** — Multi-currency jadi opsional | Impact langsung ke 95,9% user, tidak butuh infrastruktur baru |
| 2 | **D2** — Multi-tenant SaaS default | Prerequisite untuk scale ke jutaan user |
| 3 | **A2** — WhatsApp Bot | Distribusi ke 97 juta pengguna WA, dibangun setelah core selesai |
| 4 | **C2** — Revenue dari bank | Diaktifkan setelah 100k user aktif, skema data sudah siap sekarang |

# Ide: Revenue dari Bank/Fintech, Bukan dari UMKM (Opsi C2)
## UMKM Finance Tracker

> Status: 🔄 FUTURE — Diaktifkan setelah minimal 100.000 UMKM aktif dengan data
> transaksi 6+ bulan. Skema data sudah disiapkan dari sekarang (businessId ada di
> semua tabel), tapi modul ini belum dibangun.

---

## Masalah yang Diselesaikan

**OJK 2023:** 60% UMKM Indonesia gagal akses KUR karena tidak punya laporan keuangan
yang memadai. Bank punya uang untuk disalurkan tapi tidak bisa assess creditworthiness
UMKM mikro — tidak ada data transaksional yang bisa dipercaya.

Kita punya data itu. Bank mau beli. UMKM dapat app gratis.

---

## Model Bisnis

### Model 1: Credit Scoring API

Jual API ke bank/fintech yang menerima `businessId` (atau phone number) dan
mengembalikan credit score berdasarkan pola transaksi historis.

```
Bank → POST /api/credit-score { phone: "08xxx", consent_token: "xxx" }
     ← { score: 720, confidence: 0.85, factors: [...], dataMonths: 12 }
```

Revenue: subscription fee bulanan dari bank per query, atau per-query pricing.
Estimasi: Rp 1.000-5.000 per query, bank query ratusan ribu UMKM/bulan.

### Model 2: Referral KUR

User yang mau ajukan KUR dari dalam app → app forward ke bank mitra dengan
laporan keuangan yang sudah terformat → bank bayar referral fee kalau KUR cair.

Revenue: 0,5-1% dari nilai KUR. KUR nasional 2023: Rp 260 triliun.
Bahkan 0,1% dari 1% market share = Rp 260 miliar.

### Model 3: Data Insight Agregat (Anonim)

Jual insight industri ke bank, konsultan, pemerintah:
- "Rata-rata margin usaha warung makan di Jawa Tengah: X%"
- "Tren pendapatan UMKM kuliner turun Y% selama Ramadan di kota Z"

Ini tidak butuh data individual, murni agregat statistik.

---

## Prasyarat Sebelum Diaktifkan

1. **100.000 UMKM aktif** dengan minimal 6 bulan data transaksi
2. **Consent management module** — user harus explicitly opt-in untuk data sharing,
   dengan bahasa yang jelas: *"Bolehkan kami bagikan ringkasan keuangan kamu ke bank
   mitra untuk bantu kamu dapat pinjaman lebih mudah?"*
3. **Data anonymization pipeline** — sebelum kirim ke bank, strip semua PII,
   ganti businessId dengan hash satu arah, validasi tidak bisa di-reverse
4. **Legal review** — pastikan comply dengan UU PDP Indonesia (UU No. 27/2022)
   dan OJK regulation soal sharing data nasabah
5. **Partnership formal** dengan minimal satu bank penyalur KUR (BRI, BNI, atau Mandiri)

---

## Yang Perlu Ditambahkan ke Skema (Nanti, Bukan Sekarang)

```prisma
model ConsentLog {
  id          String   @id @default(cuid())
  businessId  String
  consentType String   // "CREDIT_SCORING" | "DATA_INSIGHT"
  granted     Boolean
  grantedAt   DateTime
  revokedAt   DateTime?
  ipAddress   String
  userAgent   String
  business    Business @relation(fields: [businessId], references: [id])
}

model CreditScoreRequest {
  id           String   @id @default(cuid())
  businessId   String
  requestedBy  String   // bank partner identifier
  score        Decimal?
  requestedAt  DateTime
  respondedAt  DateTime?
}
```

**Catatan:** Tabel ini TIDAK dibangun sekarang. Dokumen ini hanya memastikan
keputusan arsitektur sekarang (businessId ada di semua tabel, soft delete
jaga histori) tidak memblokir implementasi ini di masa depan.

---

## Perlindungan User

- Opt-in selalu **eksplisit**, tidak ada default "sudah setuju"
- User bisa **revoke consent kapan saja** dari Settings
- User bisa lihat **siapa saja yang sudah query data mereka**
- Data yang dikirim ke bank adalah **summary agregat**, bukan raw transaction log
- **Tidak ada nama, alamat, atau detail identitas** yang keluar dari sistem kita

---

## Kondisi TIDAK diaktifkan

- Kalau UU PDP Indonesia melarang model ini (butuh legal review serius)
- Kalau user survey menunjukkan user tidak nyaman (kepercayaan lebih penting dari revenue)
- Kalau belum ada 100k user aktif dengan data 6+ bulan

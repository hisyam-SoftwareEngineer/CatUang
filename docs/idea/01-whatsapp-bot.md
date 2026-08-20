# Ide: WhatsApp Bot sebagai Channel Input (Opsi A2)
## UMKM Finance Tracker

> Status: ✅ ADOPTED — masuk roadmap, dibangun setelah web app core Phase 1-3 selesai.
> Filosofi: web app tetap ada sebagai dashboard & laporan, WA Bot sebagai channel input
> yang lebih familiar untuk UMKM mikro.

---

## Latar Belakang

**97 juta** pengguna aktif WhatsApp di Indonesia (We Are Social 2024). Pemilik warung
lebih terbiasa kirim pesan WA daripada buka browser atau install app baru.

Barrier terbesar adopsi app keuangan UMKM bukan fiturnya — tapi **friction input harian**.
Setiap hari pemilik warung harus ingat: buka app → login → klik tombol → isi form →
submit. WhatsApp sudah terbuka 10+ kali sehari. Tinggal ketik.

---

## Desain Sistem

```
UMKM (ketik di WA)
    |
    v
WhatsApp Business API (Meta)
    |
    v
Webhook Handler (NestJS module baru: `whatsapp-bot`)
    |
    v
NLP Parser (parse natural language → structured TransactionDTO)
    |
    v
TransactionService (existing — tidak ada duplikasi logic)
    |
    v
Database (sama persis dengan transaksi via web)
    |
    v
Reply ke user: konfirmasi + saldo terkini
```

**Prinsip kunci:** Bot adalah **channel input baru**, bukan sistem terpisah.
TransactionService yang sama, database yang sama, validasi yang sama.
Bot tidak punya business logic sendiri.

---

## Flow User

```
User: masuk 500rb dari jual nasi
Bot:  ✅ Dicatat! Uang masuk Rp 500.000 (Jual Nasi)
      Saldo kas sekarang: Rp 2.350.000
      Salah? Balas "batal" dalam 5 menit.

User: keluar 200rb beli beras
Bot:  ✅ Dicatat! Uang keluar Rp 200.000 (Beli Beras)
      Saldo kas sekarang: Rp 2.150.000

User: laporan hari ini
Bot:  📊 Laporan Hari Ini (19 Agt 2026)
      Uang Masuk : Rp 1.200.000
      Uang Keluar: Rp   650.000
      Untung     : Rp   550.000
      Lihat detail: https://app.umkm.id/dashboard

User: saldo
Bot:  💰 Saldo Akun Kamu:
      • Kas Tunai : Rp 2.150.000
      • Bank BRI  : Rp 8.500.000
```

---

## NLP Parser — Pola yang Didukung

Parser berbasis rule/regex dulu (bukan LLM — tidak perlu overkill untuk pola sederhana):

| Pattern | Contoh | Hasil |
|---|---|---|
| `masuk {nominal} dari {keterangan}` | masuk 500rb dari jual nasi | MASUK, 500000, "Jual Nasi" |
| `keluar {nominal} buat {keterangan}` | keluar 200rb buat beli beras | KELUAR, 200000, "Beli Beras" |
| `keluar {nominal} {keterangan}` | keluar 50ribu listrik | KELUAR, 50000, "Listrik" |
| `{nominal} masuk {keterangan}` | 300rb masuk dari pelanggan | MASUK, 300000, "Pelanggan" |
| `laporan` / `report` | laporan | Summary hari ini |
| `laporan minggu ini` | laporan minggu ini | Summary 7 hari |
| `saldo` | saldo | Daftar saldo semua akun |
| `batal` | batal | Void transaksi terakhir (window 5 menit) |
| `bantuan` / `help` | bantuan | Daftar perintah |

**Nominal parsing:** "500rb" = 500000, "1,5jt" = 1500000, "500.000" = 500000,
"50ribu" = 50000, "2 juta" = 2000000.

---

## Strategi Gratis

**Meta WhatsApp Business API (WABA) pricing per Agustus 2026:**
- 1.000 conversations/bulan **GRATIS** per nomor bisnis (utility + service category)
- Marketing conversations: berbayar (kita tidak pakai ini)
- "Conversation" = satu sesi 24 jam, bukan per pesan

**Artinya:** Selama total conversation per nomor bisnis < 1.000/bulan, biaya = Rp 0.

**Strategi scale gratis:**
1. Mulai dengan satu nomor WA bisnis untuk semua user (multi-tenant via bot)
2. Kalau mendekati 1.000 conversation/bulan, evaluasi apakah mulai monetize atau
   tambah nomor WA bisnis baru (rotasi nomor berdasarkan region/segmen user)
3. Alternatif provider dengan free tier lebih besar: **Twilio** (trial credit),
   **360dialog** (partner Meta resmi, pricing lebih murah per conversation untuk volume)

**Yang tidak gratis:** nomor telepon bisnis itu sendiri (SIM card Indonesia ~Rp 50rb),
Railway compute untuk webhook handler (sudah include di existing Railway deployment).

---

## Keamanan & Auth

Masalah: WA tidak punya session login seperti web. Siapa yang kirim pesan harus bisa
di-map ke akun UMKM yang benar.

**Solusi: Phone number linking**
1. User register di web app terlebih dahulu (sekali saja)
2. Di Settings web app, user masukkan nomor WA mereka
3. Bot kirim kode verifikasi 6 digit ke nomor itu
4. Setelah verified, nomor WA tersimpan di tabel `User.whatsappPhone` (verified)
5. Setiap pesan masuk dari nomor itu → otomatis identified sebagai user tersebut

```
User.whatsappPhone  VARCHAR  (nullable, diisi setelah verifikasi)
User.waVerified     BOOLEAN  default false
User.waVerifiedAt   DATETIME nullable
```

**Tidak ada password di WA** — nomor telepon yang sudah verified IS the credential.
Kalau HP hilang, user disable WA linking dari web app (fitur di Settings).

---

## Multi-Akun per User

Masalah: user yang punya lebih dari satu akun kas/bank — bot harus tahu mau catat
ke akun mana.

**Solusi: default account + explicit mention**
- Setiap user set satu "akun default WA" di Settings (biasanya kas tunai)
- Transaksi via bot tanpa menyebut akun → masuk ke akun default
- Untuk akun lain: *"masuk 500rb bank dari transfer pelanggan"*
- Bot reply akun mana yang dipakai di konfirmasi

---

## Modul Baru di NestJS

```
src/modules/whatsapp-bot/
  whatsapp-bot.module.ts
  whatsapp-bot.controller.ts   # Webhook endpoint dari Meta
  whatsapp-bot.service.ts      # Orchestrate parsing → TransactionService
  parsers/
    nlp-parser.service.ts      # Natural language → TransactionDTO
    nominal-parser.ts          # "500rb", "2jt", dll → number
  templates/
    reply-templates.ts         # Format pesan balasan standar
  whatsapp-bot.service.spec.ts # Unit test WAJIB untuk parser
```

**Webhook endpoint:** `POST /api/v1/webhooks/whatsapp`
- Verifikasi signature dari Meta (HMAC-SHA256) — wajib, jangan skip
- Rate limiting ketat — Meta bisa kirim burst webhook kalau ada banyak pesan masuk

---

## Tidak Didukung via Bot (Harus via Web)

- Input transaksi TRANSFER antar akun (terlalu kompleks untuk natural language)
- Upload foto struk OCR
- Lihat laporan detail / export PDF
- Kelola kategori, akun, pengaturan
- Invite staff / kelola user

Bot adalah **shortcut untuk input cepat harian**, bukan pengganti web app.

---

## Roadmap

| Phase | Milestone |
|---|---|
| Phase 1 | Web app core selesai (auth, account, transaction, report) |
| Phase 2 | WhatsApp linking di Settings web app |
| Phase 3 | Bot: input MASUK/KELUAR + konfirmasi + saldo |
| Phase 4 | Bot: laporan harian/mingguan |
| Phase 5 | Bot: batal transaksi + multi-akun |
| Phase 6 | Evaluasi NLP parser vs LLM kalau pola input terlalu beragam |

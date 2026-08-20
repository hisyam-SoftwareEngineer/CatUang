# 07 — AI Agent Workflow & Governance
## Cara Mengawasi & Mengecek Hasil Kerja AI Coding Agent

> Ini file yang menjawab langsung pertanyaan Anda: "pengawasan dan pengecekan macam apa yang bisa dilakukan". Prinsipnya: **jangan percaya self-report AI begitu saja** — bangun lapisan pengecekan yang independen dari klaim AI sendiri.

---

## 1. Empat Lapis Pengawasan

Jangan andalkan satu lapis saja — tiap lapis menangkap jenis kesalahan berbeda:

| Lapis | Siapa yang cek | Menangkap apa |
|---|---|---|
| **1. Spec sebelum coding** | Anda (manusia), sebelum AI mulai | Scope salah, requirement tidak jelas — dicegah sebelum kode ditulis |
| **2. AI self-check** | AI, setelah generate kode | Pelanggaran checklist eksplisit (`04-coding-standards.md`, `05-security-checklist.md`) — murah tapi AI bisa lolos/khilaf |
| **3. Automated gate (CI)** | Mesin, otomatis | Bug objektif: type error, test gagal, lint error, vulnerability — tidak bisa "dibohongi" |
| **4. Review checklist** | Anda atau AI reviewer terpisah | Hal yang mesin tidak bisa deteksi: kesesuaian dengan intent bisnis, kualitas desain |

---

## 2. Lapis 1 — Spec-Driven Development

**Jangan langsung minta AI "buatkan fitur X".** Tulis Spec singkat dulu (bisa Anda tulis manual, atau minta AI *menulis draft spec* lalu Anda approve sebelum coding dimulai):

```markdown
## Spec: Fitur Approve Hasil OCR

### Requirement
User (OWNER/STAFF) bisa melihat hasil parsing OCR, koreksi field yang salah,
lalu approve jadi Transaction resmi.

### Acceptance Criteria
- [ ] GET /imports/:id mengembalikan parsedData
- [ ] PATCH /imports/:id/approve menerima correctedData opsional
- [ ] Setelah approve, Transaction baru dibuat dengan sourceType: IMPORT_OCR
- [ ] ImportBatchItem.status berubah jadi APPROVED
- [ ] Tidak ada auto-commit tanpa approve eksplisit

### File yang disentuh
- src/modules/import-ocr/*
- Tidak boleh mengubah src/modules/transaction/transaction.service.ts
  kecuali menambah method baru (bukan ubah method existing)

### Referensi
01-architecture.md Section 5.2, 06-api-contract.md (update setelah selesai)
```

**Kenapa ini penting:** tanpa spec, AI sering "membantu lebih" dengan refactor bagian lain yang tidak diminta — ini sumber utama regresi bug di vibe coding. "File yang disentuh" secara eksplisit membatasi blast radius perubahan.

## 3. Lapis 2 — AI Self-Check (Prompt Pattern)

Setelah AI generate kode, **selalu** minta langkah tambahan ini sebelum menerima hasilnya sebagai "selesai":

```
Sebelum kamu bilang tugas ini selesai:
1. Baca ulang 04-coding-standards.md Section 7 (Self-Check Checklist)
2. Baca ulang 05-security-checklist.md — bagian mana saja yang relevan dengan
   perubahan ini?
3. Jawab checklist itu satu-satu dengan bukti (kutip baris kode), bukan
   cuma "sudah semua ✓"
4. Kalau ada poin yang TIDAK terpenuhi, perbaiki dulu sebelum lapor selesai
```

Ini memaksa AI melakukan verifikasi eksplisit, bukan klaim kosong. Kalau pakai tool yang mendukung **hooks** (Kiro, Claude Code), langkah ini bisa dijadikan hook otomatis yang jalan tiap kali AI submit perubahan — jadi tidak bergantung Anda ingat mengetiknya tiap kali.

## 4. Lapis 3 — Automated Gate (CI Pipeline)

Ini lapis paling penting karena **tidak bisa dibohongi** — hasilnya pass/fail objektif. Minimal pipeline (GitHub Actions/dsb) untuk tiap PR:

```yaml
# Urutan step, fail-fast — kalau satu gagal, tidak lanjut ke step berikutnya
1. install dependencies
2. typecheck        (tsc --noEmit)      -> tangkap type error
3. lint              (eslint)           -> tangkap pelanggaran coding standard
4. test              (unit + integration) -> tangkap logic salah
5. build             (next build / nest build) -> tangkap error yang lolos dev mode
6. dependency audit  (npm audit / Snyk) -> tangkap vulnerability di library pihak ketiga
7. SAST              (Semgrep/CodeQL)   -> tangkap bug keamanan di kode sendiri (05-security-checklist.md §9)
8. (opsional) e2e test untuk alur kritis (transaksi, approve OCR)
9. deploy ke Staging (Reference Environment, 01-architecture.md §6.4) -> smoke test otomatis
```

**Promosi ke production klien terjadi manual setelah Staging hijau** — bukan auto-deploy ke semua klien begitu CI pass. Detail alur di `01-architecture.md` Section 6.4.

**PR tidak bisa di-merge kalau salah satu step merah** — ini aturan branch protection di GitHub/GitLab, bukan sekadar himbauan.

## 5. Lapis 4 — Review Checklist (Definition of Done)

Sebelum PR dianggap selesai, jawab checklist ini (Anda sendiri, atau minta AI lain sebagai "reviewer" independen dari yang menulis kode):

```markdown
## Definition of Done

- [ ] Semua acceptance criteria di Spec terpenuhi
- [ ] CI pipeline hijau semua
- [ ] 06-api-contract.md sudah update kalau ada endpoint baru/berubah
- [ ] Tidak ada file di luar "File yang disentuh" pada Spec yang berubah
      tanpa penjelasan kenapa
- [ ] Sudah dicoba manual minimal 1x untuk alur utama (bukan cuma percaya test)
- [ ] Kalau menyentuh data finansial: sudah dicek Decimal, transaction, row lock
- [ ] Kalau menyentuh auth/data sensitif: 05-security-checklist.md relevan sudah dicek
- [ ] Kalau menambah komponen shared infrastructure baru (pola seperti Quota Service, Section 6.3 arsitektur) atau mengubah auth flow: 08-threat-model.md sudah direvisi, bukan cuma kode yang berubah
```

**Trik praktis:** minta AI agent yang **berbeda sesi/instance** dari yang menulis kode untuk jadi "reviewer" — baca diff + spec, cek terhadap checklist ini. AI cenderung lebih kritis mengevaluasi kode yang bukan "hasil kerjanya sendiri" dibanding self-review pada karyanya sendiri.

## 6. Periodic Drift Audit

Setiap beberapa minggu (atau setelah beberapa fitur besar), jalankan satu prompt audit terpisah dari kerja fitur harian:

```
Bandingkan kode aktual di apps/api dan apps/web dengan seluruh isi
docs-master/*.md. Laporkan:
1. Bagian kode yang menyimpang dari aturan file master (dengan lokasi file:baris)
2. Pola yang berulang tapi tidak konsisten (misal 2 cara beda handle error
   di 2 modul berbeda)
3. Dependency yang ditambahkan tapi tidak tercatat alasannya
4. Endpoint yang ada di kode tapi tidak ada di 06-api-contract.md (atau
   sebaliknya)
```

Ini menangkap "penyimpangan pelan-pelan" yang lolos dari review harian — biasanya muncul karena tekanan waktu bikin standar sedikit dilonggarkan tiap PR, dan akumulasinya baru terlihat kalau di-audit sekaligus.

## 7. Setup Praktis per Tool

- **Claude Code:** taruh ringkasan constraint di `CLAUDE.md` root repo (auto-terbaca tiap sesi). File `docs-master/*.md` tetap sebagai detail lengkap, `CLAUDE.md` cukup index + pointer + aturan paling kritis. Hooks bisa dipakai untuk auto-run lint/test setelah AI edit file.
- **Kiro:** file master masuk Steering Files (auto-inject), Spec per fitur pakai fitur Specs bawaan, self-check pakai Hooks yang trigger setelah code generation.
- **Cursor:** `.cursor/rules/*.mdc` untuk aturan yang selalu aktif, referensi ke `docs-master/` untuk detail.
- **Tool apa pun / generic:** minimal, mulai tiap sesi baru dengan eksplisit minta AI baca `docs-master/00-project-constitution.md` sampai `08-threat-model.md` dulu sebelum coding — jangan asumsikan AI otomatis tahu meski file-nya ada di repo.

## 8. Ringkasan — Kapan Pakai Lapis Mana

```
Mulai fitur baru
  -> Tulis/review Spec (Lapis 1)
  -> AI coding
  -> AI self-check terhadap checklist (Lapis 2)
  -> Push, CI jalan otomatis (Lapis 3)
  -> CI hijau -> Review checklist / Definition of Done (Lapis 4)
  -> Merge
  -> [Berkala] Drift audit (Section 6)
```

Sistem ini yang membuat kualitas "high-end, maintainable, clean code" **bukan** bergantung pada satu prompt yang bagus, tapi pada proses berlapis yang tetap konsisten walau AI/sesi berganti-ganti.

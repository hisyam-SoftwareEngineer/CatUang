# 03 — Backend Guide
## UMKM Finance Tracker (NestJS + Prisma + PostgreSQL/Supabase)

> File ini adalah **constraint aktif**, dibaca sebelum AI membuat/mengubah kode di `apps/api`. Merujuk struktur modul di `01-architecture.md` Section 3.

---

## 1. Struktur per Modul (Wajib Konsisten)

Setiap modul di `src/modules/<nama>/` **harus** punya struktur ini, tidak boleh menyimpang:

```
src/modules/transaction/
  transaction.module.ts
  transaction.controller.ts     # HTTP layer SAJA — validasi input & panggil service
  transaction.service.ts        # Business logic — SATU-SATUNYA tempat logic bisnis
  transaction.repository.ts     # (opsional) kalau query Prisma kompleks, pisahkan dari service
  dto/
    create-transaction.dto.ts   # class-validator, tidak ada logic
    update-transaction.dto.ts
  entities/
    transaction.entity.ts       # Response shape, terpisah dari Prisma model
  transaction.service.spec.ts   # Unit test WAJIB untuk service
```

**Aturan keras:** Controller **tidak boleh** memanggil `PrismaService` langsung. Semua akses database lewat Service (atau Repository kalau dipisah). Ini bukan gaya preferensi — ini penegakan prinsip non-negosiabel brief ("tidak ada business logic di controller").

## 2. Kontrak Modul Antar-Domain

Sesuai `01-architecture.md` Section 3: modul lain **tidak boleh** import `PrismaService` untuk query tabel milik modul lain. Kalau modul `report` butuh data dari `transaction`, dia panggil method public `TransactionService`, bukan `prisma.transaction.findMany()` langsung. Setiap service yang boleh dipanggil modul lain **wajib** diekspor eksplisit di `*.module.ts` lewat `exports: []`.

## 3. Error Handling Standar

Semua error response mengikuti format konsisten (dipakai di seluruh API, bukan ad-hoc per endpoint):

```json
{
  "statusCode": 400,
  "errorCode": "INSUFFICIENT_BALANCE",
  "message": "Saldo kas tidak cukup untuk transaksi ini",
  "timestamp": "2026-08-11T10:00:00Z"
}
```

- `errorCode` dalam `SCREAMING_SNAKE_CASE`, dipakai frontend untuk logic (misal tampilkan pesan spesifik), **bukan** untuk parsing string `message`.
- `message` **selalu** bahasa Indonesia awam (Section 2 brief) — pesan ini yang tampil ke user, bukan pesan teknis/stack trace.
- Implementasi lewat satu `GlobalExceptionFilter` di level aplikasi — jangan `try/catch` ad-hoc mengembalikan format beda-beda di tiap controller.
- Custom exception class per domain error (`InsufficientBalanceException extends BusinessException`) — bukan lempar `Error` generik atau string mentah.

## 4. Validasi Input

- Semua DTO pakai `class-validator` + `class-transformer`, divalidasi otomatis lewat `ValidationPipe` global (`whitelist: true, forbidNonWhitelisted: true`) — field yang tidak terdaftar di DTO **ditolak**, bukan diabaikan diam-diam.
- Validasi angka uang: custom validator `@IsPositiveDecimal()` — **selalu > 0**, tipe string yang representasi Decimal. Jangan pakai `@IsNumber()` — kolom uang tidak pernah `number`/`float`.
- **Validasi currency:** `@IsSupportedCurrency()` untuk field `currency` di semua DTO uang.

### Aturan validasi spesifik per TransactionType (ditegakkan di service layer):

| Kondisi | Validasi | Error |
|---|---|---|
| MASUK/KELUAR | `dto.currency === account.currency` | `CURRENCY_MISMATCH` |
| MASUK/KELUAR | `counterAccountId`, `counterAmount`, `exchangeRateUsed` harus null/undefined | `BAD_REQUEST` via ValidationPipe |
| TRANSFER | `counterAccountId` wajib ada | `BAD_REQUEST` via ValidationPipe |
| TRANSFER | `accountId !== counterAccountId` | `SAME_ACCOUNT_TRANSFER` |
| TRANSFER | Kedua akun milik `businessId` yang sama | `ACCOUNT_NOT_FOUND` |
| TRANSFER cross-currency | `counterAmount` wajib ada | `BAD_REQUEST` |
| TRANSFER cross-currency | `exchangeRateUsed` wajib ada dan > 0 | `EXCHANGE_RATE_REQUIRED` |
| TRANSFER same-currency | `exchangeRateUsed` tidak diperlukan (backend set 1 secara otomatis) | — |
| Semua | `amount > 0` | Ditolak di DTO level |
| Semua | `occurredAt` tidak boleh lebih dari 24 jam di masa depan | `INVALID_DATE` |

**`counterCurrency` tidak dikirim client** — backend mengambil otomatis dari `counterAccount.currency` saat menyimpan Transaction.

**Idempotency-Key:** diinjeksi di controller via `@Headers('idempotency-key')`, diteruskan ke service sebagai parameter. Kalau kosong/null → `IDEMPOTENCY_KEY_REQUIRED`. Tidak perlu validasi format UUID di server (client responsibility).

### 4a. Idempotency-Key untuk Endpoint Finansial Sinkron

Row lock + atomic transaction (Section 6 di bawah) mencegah **race condition** (dua request paralel di waktu yang sama), tapi **tidak** mencegah **duplikasi dari retry** (misal koneksi timeout lalu client retry otomatis, atau user double-tap tombol submit karena jaringan lambat) — dua masalah yang berbeda, butuh mitigasi berbeda.

- `POST /transactions` **wajib** menerima header `Idempotency-Key` (UUID di-generate client, sekali per user action — bukan di-generate ulang tiap retry).
- Header diinjeksi di controller via `@Headers('idempotency-key') idempotencyKey: string` — bukan bagian dari request body DTO.
- Service cek Redis (`idempotency:{key}` → cached response JSON) sebelum eksekusi: kalau key sudah ada dan masih dalam window (24 jam), **kembalikan response yang tersimpan (di-parse kembali)**, jangan eksekusi ulang.
- Kalau belum ada: eksekusi normal, lalu simpan response sebagai JSON string ke Redis dengan TTL 86400 detik (24 jam).
- Ini melengkapi (bukan menggantikan) row lock.

**Pattern controller:**
```typescript
@Post()
async create(
  @Body() dto: CreateTransactionDto,
  @Headers('idempotency-key') idempotencyKey: string,
  @Req() req: AuthRequest,
) {
  return this.transactionService.createTransaction(dto, req.user.id, req.user.businessId, idempotencyKey);
}
```

**Pattern service (idempotency check):**
```typescript
// Cek cache terlebih dahulu
const cached = await this.redisService.get(`idempotency:${idempotencyKey}`);
if (cached) return JSON.parse(cached) as TransactionEntity;

// ... eksekusi bisnis ...

// Simpan ke cache setelah sukses
await this.redisService.set(`idempotency:${idempotencyKey}`, JSON.stringify(result), 86400);
return result;
```

### 4b. RedisService untuk Idempotency

BullMQ menggunakan Redis tapi connection-nya internal dan tidak bisa dipakai langsung untuk key-value cache. Buat `RedisService` terpisah sebagai wrapper tipis `ioredis`:

```
src/common/services/
  redis.service.ts    ← wrapper ioredis: get, set, del
  redis.module.ts     ← @Global() module, export RedisService
```

**redis.service.ts:**
```typescript
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  constructor(configService: ConfigService) {
    this.client = new Redis(configService.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
```

`RedisModule` harus `@Global()` dan diekspor supaya tidak perlu di-import ulang di tiap modul. Daftarkan di `AppModule`.

## 5. Auth & Authorization

**Pola hybrid token** (alasan lengkap & analisis ancaman di `01-architecture.md` §8.5 dan `08-threat-model.md` §3.2) — wajib diikuti persis, ini bukan preferensi gaya:

- **Access token**: JWT umur pendek (15 menit), dikembalikan di **response body** saat login/refresh (bukan cookie), disimpan frontend di memori (React context, Section 5 frontend guide) — dikirim tiap request via header `Authorization: Bearer <token>`.
- **Refresh token**: umur lebih panjang (misal 7 hari), disimpan di cookie `httpOnly + Secure + SameSite=None` (wajib `None` karena Vercel↔Railway beda domain), **tidak pernah** diekspos ke response body.
- **Refresh token rotation**: setiap `POST /auth/refresh` sukses, refresh token lama langsung di-invalidate (soft-delete/blacklist di tabel `RefreshToken`) dan yang baru diterbitkan. Kalau refresh token yang sudah invalid dipakai lagi → **revoke semua refresh token dalam "family" yang sama** (indikasi token dicuri) → paksa login ulang.
- **CSRF protection untuk `/auth/refresh` & `/auth/logout`** (satu-satunya endpoint yang bergantung cookie): double-submit token — cookie tambahan non-httpOnly (`csrf-token`) diset saat login, frontend baca & kirim ulang sebagai header `X-CSRF-Token`, backend bandingkan. Endpoint lain (pakai `Authorization` header) **tidak butuh** CSRF token karena secara natural imun.
- CORS dikonfigurasi `credentials: true` dengan **origin eksplisit per klien** (bukan wildcard `*`, dan bukan `credentials: true` + `origin: '*'` yang browser tolak) — origin domain Vercel klien tersebut didaftarkan di env var (`ALLOWED_ORIGIN`), divalidasi startup sesuai prinsip Section 8.
- Guard role (`OWNER`/`STAFF`, sesuai `01-architecture.md` Section 4.5) diterapkan lewat decorator custom `@Roles('OWNER')` + `RolesGuard`, dicek di level controller method, bukan logic manual `if (user.role !== 'OWNER')` bertebaran di tiap service.
- Endpoint yang mengubah `Account.balance`, `BusinessSettings`, atau menghapus data **wajib** eksplisit menyatakan role yang diizinkan — tidak ada endpoint "lupa" guard karena asumsi default.

## 6. Database Query Rules

- **Tidak ada N+1 query** — pakai Prisma `include`/`select` untuk relasi, bukan loop query di service.
- **Setiap multi-write wajib `prisma.$transaction()`** — terutama alur TRANSFER yang mengubah 2 `Account.balance` sekaligus.
- **Row locking untuk update saldo** — pakai `$queryRaw` dengan `SELECT ... FOR UPDATE` di dalam `prisma.$transaction()`. Pattern baku:

```typescript
// Di dalam prisma.$transaction(async (tx) => { ... })
// 1. Lock baris account yang akan diubah (mencegah race condition)
const [account] = await tx.$queryRaw<Account[]>`
  SELECT * FROM "Account"
  WHERE id = ${accountId}
  AND "businessId" = ${businessId}
  AND "deletedAt" IS NULL
  FOR UPDATE
`;

if (!account) throw new AccountNotFoundException();

// 2. Validasi saldo (setelah lock — angka ini sudah pasti tidak berubah oleh request lain)
if (type === TransactionType.KELUAR) {
  if (account.balance.lessThan(amount)) throw new InsufficientBalanceException();
}

// 3. Insert Transaction
const transaction = await tx.transaction.create({ data: { ... } });

// 4. Update balance
await tx.account.update({
  where: { id: accountId },
  data: { balance: { increment: delta } }, // delta positif untuk MASUK, negatif untuk KELUAR
});
```

**Untuk TRANSFER:** lock KEDUA akun sekaligus sebelum operasi apapun, dengan urutan ID yang konsisten (sort by id ascending) untuk mencegah deadlock:

```typescript
// Sort ascending by ID supaya urutan lock selalu konsisten — mencegah deadlock
const lockIds = [accountId, counterAccountId].sort();
const [acct1, acct2] = await tx.$queryRaw<Account[]>`
  SELECT * FROM "Account"
  WHERE id = ANY(${lockIds}::text[])
  AND "businessId" = ${businessId}
  AND "deletedAt" IS NULL
  ORDER BY id ASC
  FOR UPDATE
`;
```

- Query list **wajib** pagination (`take`/`skip`) — tidak ada endpoint yang `findMany()` tanpa limit.
- Index wajib ada di `schema.prisma` untuk kolom yang sering jadi filter: `Transaction.occurredAt`, `Transaction.accountId`, `Transaction.businessId`.

### 6a. Inline AuditLog untuk Operasi dengan Pre-State

`AuditLogInterceptor` hanya bisa capture `afterState` (response data). Untuk operasi yang butuh `beforeState` (void transaction, update account), **tulis AuditLog langsung di dalam service** bukan via interceptor:

```typescript
// Contoh: void transaction — butuh beforeState
await tx.auditLog.create({
  data: {
    businessId,
    userId,
    entityType: 'Transaction',
    entityId: transaction.id,
    action: AuditAction.UPDATE,
    beforeState: {            // ← snapshot sebelum diubah
      status: transaction.status,
      amount: transaction.amount.toString(),
    },
    afterState: {             // ← state setelah void
      status: TransactionStatus.VOID,
    },
  },
});
```

Aturan: kalau operasi butuh `beforeState` → inline audit log di service. Kalau hanya butuh `afterState` (CREATE) → gunakan `@AuditLog` decorator + interceptor.

## 7. Background Job (BullMQ)

- Job **idempotent** — kalau job yang sama dijalankan ulang (retry), tidak boleh menghasilkan efek ganda (misal dua `Transaction` untuk satu struk yang sama). Gunakan `ImportBatchItem.id` sebagai idempotency key.
- Job OCR & Export **wajib** update status (`PENDING` → `PROCESSING` → `DONE`/`FAILED`) supaya frontend bisa polling status, bukan asumsi job pasti sukses.
- Retry policy eksplisit per job type (misal OCR: 3x retry dengan backoff; Export: 2x) — jangan biarkan default BullMQ tanpa dipikirkan.

## 8. Environment Variable

- Semua env var divalidasi saat startup pakai `Zod` schema (`src/config/env.schema.ts`) — aplikasi **gagal start** dengan pesan jelas kalau env var wajib tidak ada (sudah prinsip non-negosiabel brief, ini implementasi konkretnya).
- Tidak ada default value untuk secret (API key, JWT secret, DB URL) — kalau tidak di-set, harus gagal, bukan jalan dengan default yang tidak aman.

## 9. API Versioning

- Semua endpoint di-prefix `/api/v1/` sejak endpoint pertama dibuat (`app.setGlobalPrefix('api/v1')` atau `VersioningType.URI` bawaan NestJS) — sesuai prinsip non-negosiabel `00-project-constitution.md` Section 4.
- **Kenapa dari hari pertama, bukan "nanti kalau perlu":** menambah `/v1/` di atas endpoint yang sudah dipakai klien production (Section 6.1 arsitektur) berarti breaking change terkoordinasi ke semua deployment klien sekaligus — jauh lebih murah dilakukan sebelum ada satu pun klien live.
- Breaking change di masa depan (kalau terjadi) dapat `/api/v2/`, versi lama tetap jalan sampai semua klien dipastikan pindah — bukan langsung mematikan `v1`.

## 10. Security Headers (Helmet)

- `helmet()` dipasang sebagai global middleware di `main.ts`, bukan opsional.
- Konfigurasi `Content-Security-Policy` disesuaikan kebutuhan app ini (bukan default helmet mentah): `connect-src` mengizinkan domain API sendiri, `img-src` mengizinkan domain Cloudinary, `default-src 'self'` sebagai baseline ketat.
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` termasuk default `helmet()` — pastikan tidak di-override/dimatikan tanpa alasan eksplisit.
- Detail kenapa tiap header ini relevan untuk app ini ada di `01-architecture.md` Section 8.6 dan `08-threat-model.md`.

## 11. Multi-Tenant Scoping (Wajib di Semua Query)

Karena sistem sekarang multi-tenant SaaS (lihat `01-architecture.md` Section 6.1),
setiap query Prisma yang membaca/menulis data bisnis **wajib** di-scope dengan `businessId`
dari JWT claim — bukan dari request body.

**Pattern yang benar:**
```typescript
// Di service, businessId diambil dari JWT (diinject middleware), bukan dari dto
async getTransactions(businessId: string, filters: FilterDto) {
  return this.prisma.transaction.findMany({
    where: {
      businessId,   // selalu dari token, tidak pernah dari user input
      ...filters,
      deletedAt: null,
    },
  });
}
```

**Pattern yang salah (JANGAN LAKUKAN):**
```typescript
// BERBAHAYA — user bisa kirim businessId milik orang lain di request body
async getTransactions(dto: GetTransactionsDto) {
  return this.prisma.transaction.findMany({
    where: { businessId: dto.businessId }, // ❌
  });
}
```

**Middleware `BusinessContext`:** tiap request yang masuk lewat JWT guard
otomatis meng-inject `req.businessId` dari token claim. Semua service method
yang butuh `businessId` menerimanya sebagai parameter, bukan membaca dari
`PrismaService` atau request secara langsung.

**Test wajib:** sebelum go-live, wajib ada test suite "tenant isolation" yang
membuktikan user dari `businessId` A tidak bisa mengakses data `businessId` B.

## 12. WhatsApp Bot — Aturan Module

Modul `whatsapp-bot` mengikuti aturan yang sama dengan semua modul lain, ditambah:

- **Verifikasi HMAC-SHA256** dari Meta wajib dilakukan di controller sebelum
  request diproses — tolak dengan `403` kalau signature tidak valid, log sebagai
  security event
- **NLP Parser** (`nlp-parser.service.ts`) harus dikemas sebagai service terpisah
  dengan unit test lengkap — parser adalah logika yang paling sering salah dan
  paling mudah di-test secara terisolasi
- **Tidak ada business logic di modul ini** — setelah parse berhasil, langsung
  panggil `TransactionService.createTransaction()` atau `AccountService.getBalances()`
  yang sudah ada. Bot tidak boleh menghitung saldo sendiri, tidak boleh akses Prisma langsung
- **Reply bersifat async** — controller return `200 OK` ke Meta dalam < 5 detik,
  kirim reply WA via background task atau langsung di service tapi bukan blocking
  (Meta timeout webhook dalam 20 detik, best practice reply dalam < 5 detik)
- **Rate limiting ketat** di endpoint webhook — mencegah flood dari spoofed requests


## 13. Larangan Eksplisit

- Tidak ada `any` — pakai `unknown` + type guard kalau benar-benar perlu (dengan komentar alasan).
- Tidak ada query Prisma langsung di controller.
- Tidak ada hardcoded credential/API key.
- Tidak ada `Float`/`Number` untuk kolom uang — selalu `Decimal`.
- Tidak ada auto-commit hasil OCR ke tabel `Transaction` tanpa status `APPROVED` dari review manusia.
- Tidak ada konversi currency otomatis "diam-diam" di service.
- **Tidak ada query tanpa `businessId` filter** untuk tabel yang menyimpan data per-bisnis — ini non-negosiabel untuk multi-tenant (Section 11 di atas).
- **Tidak ada business logic di `whatsapp-bot` module** — parse saja, panggil service yang sudah ada (Section 12 di atas).

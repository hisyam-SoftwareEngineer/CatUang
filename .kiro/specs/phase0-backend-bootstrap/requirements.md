# Requirements Document

## Introduction

Phase 0 adalah fondasi teknis seluruh backend UMKM Finance Tracker. Scope ini menyiapkan infrastruktur minimal yang valid sebelum fitur bisnis ditulis: validasi environment saat startup, Prisma schema lengkap tersambung ke PostgreSQL, BullMQ tersambung ke Upstash Redis, security headers aktif, API versioning terpasang, health check endpoint memverifikasi semua koneksi, error response terstandarisasi, input validation global, dan whitelist mata uang siap digunakan.

Semua komponen di phase ini bersifat _cross-cutting_ — digunakan oleh seluruh modul yang akan dibangun di Phase 1+. Kegagalan di phase ini (misalnya uang disimpan sebagai Float, validasi env tidak ada, versioning terlupakan) akan membebani seluruh codebase dengan biaya refactor yang sangat mahal.

---

## Glossary

- **Application**: Aplikasi backend NestJS yang di-bootstrap di `main.ts`
- **ConfigModule**: Modul NestJS yang mengelola konfigurasi dan validasi environment variable via Zod
- **EnvValidator**: Fungsi `validate()` yang dipanggil `ConfigModule.forRoot()` untuk memvalidasi semua env var dengan Zod schema
- **PrismaService**: Service NestJS yang meng-extend `PrismaClient`, mengelola lifecycle koneksi database
- **BullMQ_Queue**: Queue `ocr-processing` yang terdaftar via `BullModule.registerQueue()` dan terhubung ke Upstash Redis
- **HealthController**: Controller NestJS yang menangani endpoint `GET /api/v1/health`
- **HealthService**: Service yang melakukan pengecekan koneksi paralel ke Postgres dan Redis
- **GlobalExceptionFilter**: Filter NestJS yang menangkap semua exception dan mengembalikan error response berformat standar
- **GlobalValidationPipe**: `ValidationPipe` NestJS global dengan konfigurasi `whitelist: true, forbidNonWhitelisted: true`
- **SUPPORTED_CURRENCIES**: Konstanta array berisi 7 kode mata uang yang didukung aplikasi: `IDR`, `USD`, `SGD`, `MYR`, `EUR`, `CNY`, `AUD`

---

## Requirements

### Requirement 1: Environment Variable Validation

**User Story:** Sebagai developer, saya ingin aplikasi memvalidasi semua env var wajib saat startup, sehingga kesalahan konfigurasi terdeteksi sebelum server menerima koneksi apapun.

#### Acceptance Criteria

1. WHEN the Application starts, THE EnvValidator SHALL validate all required environment variables using a Zod schema before any module initializes
2. IF any required environment variable is missing or invalid, THEN THE Application SHALL terminate immediately with a descriptive error message that names each failing variable and its violation
3. THE EnvValidator SHALL require `DATABASE_URL` to be a valid URL starting with `postgresql://`
4. THE EnvValidator SHALL require `REDIS_URL` to be a valid URL starting with `rediss://` (two s characters, indicating TLS)
5. THE EnvValidator SHALL require `JWT_ACCESS_SECRET` to be a string of at least 32 characters
6. THE EnvValidator SHALL require `JWT_REFRESH_SECRET` to be a string of at least 32 characters
7. THE EnvValidator SHALL require `CSRF_SECRET` to be a string of at least 32 characters
8. THE EnvValidator SHALL require `ALLOWED_ORIGIN` to be a valid URL
9. THE EnvValidator SHALL require `NODE_ENV` to be one of `development`, `production`, or `test`
10. THE EnvValidator SHALL accept `PORT` as an integer between 1 and 65535, defaulting to `3000` if not provided
11. THE EnvValidator SHALL NOT provide default values for secret variables (`DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`)
12. IF the Application starts successfully, THEN THE ConfigModule SHALL make all validated env values available globally via `ConfigService` without re-importing `ConfigModule` in each module

---

### Requirement 2: Prisma Schema dan Database Models

**User Story:** Sebagai developer, saya ingin Prisma schema yang lengkap mencakup semua domain model bisnis, sehingga migrasi pertama dapat dijalankan dan fondasi data tersedia untuk seluruh phase berikutnya.

#### Acceptance Criteria

1. THE PrismaService SHALL connect to the PostgreSQL database using `DATABASE_URL` from `ConfigService` on module initialization
2. THE PrismaService SHALL disconnect from the database cleanly when the Application shuts down
3. THE Prisma schema SHALL define model `Business` with fields: `id` (cuid), `name`, `baseCurrency` (`Char(3)`, default `IDR`), `createdAt`, `updatedAt`, `deletedAt` (nullable)
4. THE Prisma schema SHALL define model `User` with fields: `id` (cuid), `businessId`, `email` (unique), `passwordHash`, `role` (enum `OWNER`/`STAFF`), `status` (enum `ACTIVE`/`INVITED`/`DISABLED`, default `ACTIVE`), `createdAt`, `updatedAt`, `deletedAt` (nullable)
5. THE Prisma schema SHALL define model `Account` with fields: `id` (cuid), `businessId`, `name`, `currency` (`Char(3)`), `balance` (`Decimal(15,2)`), `createdAt`, `updatedAt`, `deletedAt` (nullable)
6. THE Prisma schema SHALL define model `Category` with fields: `id` (cuid), `businessId`, `name`, `isDefault` (boolean, default false), `createdAt`, `updatedAt`, `deletedAt` (nullable)
7. THE Prisma schema SHALL define model `Transaction` with fields: `id` (cuid), `businessId`, `accountId`, `categoryId` (nullable), `userId`, `type` (enum `MASUK`/`KELUAR`/`TRANSFER`), `amount` (`Decimal(15,2)`), `currency` (`Char(3)`), `counterAccountId` (nullable), `counterAmount` (`Decimal(15,2)` nullable), `counterCurrency` (`Char(3)` nullable), `exchangeRateUsed` (`Decimal(18,6)` nullable), `description` (nullable), `occurredAt`, `sourceType` (enum `MANUAL`/`IMPORT_OCR`), `status` (enum `CONFIRMED`/`VOID`), `idempotencyKey` (unique, nullable), `createdAt`, `updatedAt`, `deletedAt` (nullable)
8. THE Prisma schema SHALL define model `ExchangeRate` with fields: `id` (cuid), `businessId`, `fromCurrency` (`Char(3)`), `toCurrency` (`Char(3)`), `rate` (`Decimal(18,6)`), `effectiveDate`, `createdAt`, `updatedAt`
9. THE Prisma schema SHALL define model `AuditLog` with fields: `id` (cuid), `businessId`, `userId` (nullable), `entityType`, `entityId`, `action` (enum `CREATE`/`UPDATE`/`DELETE`), `beforeState` (Json nullable), `afterState` (Json nullable), `createdAt` — tanpa `updatedAt` dan tanpa `deletedAt` (append-only)
10. THE Prisma schema SHALL NOT use `Float` or `Int` for any monetary column — all monetary values SHALL use `Decimal @db.Decimal(15, 2)` or `Decimal @db.Decimal(18, 6)` for exchange rates
11. THE Prisma schema SHALL include database indexes on `Transaction.occurredAt`, `Transaction.accountId`, `Transaction.businessId`, and `Transaction.status` for query performance
12. THE PrismaService SHALL expose a `pingDatabase()` method that executes `SELECT 1` and returns `true` on success, for use by `HealthService`

---

### Requirement 3: BullMQ dan Redis Connection

**User Story:** Sebagai developer, saya ingin BullMQ terhubung ke Upstash Redis melalui protokol TLS, sehingga infrastruktur queue tersedia untuk job background di phase berikutnya.

#### Acceptance Criteria

1. WHEN the Application starts, THE BullMQ_Queue SHALL establish a connection to the Redis instance using `REDIS_URL` from environment configuration
2. THE BullMQ_Queue connection SHALL use the `rediss://` protocol (TLS) — koneksi dengan `redis://` (tanpa TLS) SHALL be rejected at the Zod validation stage before the Application starts
3. THE BullMQ_Queue SHALL register a queue named exactly `ocr-processing`
4. THE BullMQ_Queue connection config SHALL set `maxRetriesPerRequest: null` to comply with BullMQ's ioredis requirements
5. THE BullMQ_Queue connection config SHALL set `enableReadyCheck: false` to prevent connection timeout during Upstash cold starts
6. THE BullMQ_Queue SHALL NOT hardcode the Redis URL — the URL MUST be sourced from `REDIS_URL` environment variable at runtime
7. WHEN the health check is invoked, THE BullMQ_Queue SHALL expose a Redis client capable of responding to a `PING` command to verify connectivity

---

### Requirement 4: Security Headers (Helmet)

**User Story:** Sebagai security engineer, saya ingin Helmet terpasang sebagai global middleware dengan Content Security Policy yang tepat, sehingga seluruh response HTTP memiliki security headers yang sesuai.

#### Acceptance Criteria

1. WHEN the Application starts, THE Application SHALL apply `helmet()` as the first middleware before all other middleware and route handlers
2. THE Application SHALL configure `Content-Security-Policy` with directive `default-src 'self'` as a strict baseline
3. THE Application SHALL configure `Content-Security-Policy` with directive `connect-src 'self'` to restrict connection origins
4. THE Application SHALL configure `Content-Security-Policy` with directive `img-src 'self' https://res.cloudinary.com` to allow Cloudinary images
5. THE Application SHALL retain Helmet's default headers: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY` without overriding or disabling them
6. THE Application SHALL configure CORS to allow credentials (`credentials: true`) with the origin set explicitly to the value of `ALLOWED_ORIGIN` env var — wildcard `*` is not permitted

---

### Requirement 5: API Versioning

**User Story:** Sebagai developer API, saya ingin semua endpoint diawali dengan prefix `/api/v1`, sehingga breaking change di masa depan dapat dikelola tanpa memutus klien yang sudah berjalan.

#### Acceptance Criteria

1. THE Application SHALL set global prefix `api/v1` such that all registered routes are accessible under `/api/v1/`
2. WHEN a request is made to a path without the `/api/v1` prefix, THE Application SHALL return HTTP 404
3. THE Application SHALL apply the global prefix from the first endpoint created — tidak ada endpoint yang boleh exist tanpa prefix ini

---

### Requirement 6: Health Check Endpoint

**User Story:** Sebagai operator sistem, saya ingin endpoint health check yang memverifikasi koneksi aktif ke Postgres dan Redis, sehingga status infrastruktur dapat dipantau dan masalah koneksi dapat dideteksi lebih awal.

#### Acceptance Criteria

1. THE HealthController SHALL handle `GET /api/v1/health` requests
2. THE HealthController SHALL delegate all health check logic to `HealthService` — tidak ada logic pengecekan koneksi di controller
3. WHEN `GET /api/v1/health` is called, THE HealthService SHALL check both Postgres and Redis connectivity concurrently using `Promise.all()`
4. WHEN both database and Redis are reachable, THE HealthService SHALL return HTTP 200 with body `{ "status": "ok", "timestamp": "<ISO 8601>", "services": { "database": { "status": "ok", "latencyMs": <number> }, "redis": { "status": "ok", "latencyMs": <number> } } }`
5. WHEN only one service is reachable, THE HealthService SHALL return HTTP 503 with body containing `{ "status": "degraded", ... }` with per-service detail
6. WHEN both database and Redis are unreachable, THE HealthService SHALL return HTTP 503 with body containing `{ "status": "error", ... }` with per-service error detail
7. THE HealthService SHALL measure latency for each service check using `Date.now()` diff before and after the ping call
8. IF a database ping fails, THEN THE HealthService SHALL include the error message in `services.database.error` without exposing stack traces
9. IF a Redis ping fails, THEN THE HealthService SHALL include the error message in `services.redis.error` without exposing stack traces

---

### Requirement 7: Global Exception Filter

**User Story:** Sebagai developer frontend, saya ingin semua error response dari API menggunakan format yang konsisten, sehingga frontend dapat menampilkan pesan error yang tepat tanpa perlu menangani berbagai format berbeda.

#### Acceptance Criteria

1. THE Application SHALL register `GlobalExceptionFilter` as a global filter that catches all unhandled exceptions
2. WHEN an `HttpException` is thrown, THE GlobalExceptionFilter SHALL return a JSON response with fields: `statusCode` (integer), `errorCode` (SCREAMING_SNAKE_CASE string), `message` (string bahasa Indonesia awam), `timestamp` (ISO 8601 string)
3. WHEN an unknown exception is thrown, THE GlobalExceptionFilter SHALL return HTTP 500 with `errorCode: "INTERNAL_SERVER_ERROR"` and message `"Terjadi kesalahan pada server. Coba lagi dalam beberapa saat."`
4. THE GlobalExceptionFilter SHALL map HTTP status codes to `errorCode` values: 400 → `BAD_REQUEST`, 401 → `UNAUTHORIZED`, 403 → `FORBIDDEN`, 404 → `NOT_FOUND`, 409 → `CONFLICT`, 422 → `UNPROCESSABLE_ENTITY`, 429 → `TOO_MANY_REQUESTS`, 503 → `SERVICE_UNAVAILABLE`
5. WHEN an `HttpException` carries a custom `errorCode` in its response body, THE GlobalExceptionFilter SHALL preserve that custom `errorCode` instead of deriving it from the status code
6. THE GlobalExceptionFilter SHALL NOT expose stack traces or internal error details in the response body to the client
7. WHEN an unknown exception occurs, THE GlobalExceptionFilter SHALL log the full stack trace server-side for debugging purposes

---

### Requirement 8: Global ValidationPipe

**User Story:** Sebagai developer backend, saya ingin semua request body divalidasi secara otomatis dan field yang tidak terdaftar di DTO ditolak, sehingga data yang masuk ke service layer selalu bersih dan sesuai kontrak.

#### Acceptance Criteria

1. THE Application SHALL register `ValidationPipe` as a global pipe applied to all endpoints
2. THE GlobalValidationPipe SHALL be configured with `whitelist: true` so that properties not defined in the DTO are silently stripped from the request
3. THE GlobalValidationPipe SHALL be configured with `forbidNonWhitelisted: true` so that requests containing undeclared properties are rejected with HTTP 400 instead of silently ignored
4. THE GlobalValidationPipe SHALL be configured with `transform: true` so that incoming plain objects are automatically transformed to their DTO class instances
5. WHEN a request body contains a property not declared in the corresponding DTO, THE GlobalValidationPipe SHALL return HTTP 400 with a descriptive validation error message

---

### Requirement 9: Currency Constants

**User Story:** Sebagai developer, saya ingin whitelist mata uang yang didukung tersedia sebagai konstanta terpusat, sehingga semua modul menggunakan daftar yang sama dan tidak ada duplikasi atau inkonsistensi.

#### Acceptance Criteria

1. THE Application SHALL define a constant `SUPPORTED_CURRENCIES` containing exactly these 7 currency codes in order: `IDR`, `USD`, `SGD`, `MYR`, `EUR`, `CNY`, `AUD`
2. THE `SUPPORTED_CURRENCIES` constant SHALL be typed as a readonly tuple (`as const`) so that the type system enforces membership at compile time
3. THE Application SHALL export a type alias `SupportedCurrency` derived from `typeof SUPPORTED_CURRENCIES[number]` for use in DTOs and service interfaces
4. THE `SUPPORTED_CURRENCIES` constant SHALL be defined in a single file (`src/common/constants/currency.constants.ts`) and imported from there — SHALL NOT be duplicated in other files
5. THE Application SHALL NOT accept ISO 4217 currency codes outside of the `SUPPORTED_CURRENCIES` whitelist in any monetary field

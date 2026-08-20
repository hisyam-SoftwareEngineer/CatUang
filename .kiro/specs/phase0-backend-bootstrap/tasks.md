# Implementation Plan: Phase 0 — Backend Bootstrap

## Overview

Rencana implementasi ini membangun fondasi teknis backend NestJS: validasi environment, Prisma schema + migrasi, koneksi BullMQ/Redis, security headers, API versioning, health check endpoint, global exception filter, global ValidationPipe, dan konstanta mata uang.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "3", "5"] },
    { "wave": 3, "tasks": ["4"] },
    { "wave": 4, "tasks": ["6", "7"] },
    { "wave": 5, "tasks": ["8"] },
    { "wave": 6, "tasks": ["9"] },
    { "wave": 7, "tasks": ["10", "11", "12"] },
    { "wave": 8, "tasks": ["13"] }
  ]
}
```

## Tasks

- [x] 1. Install Dependencies and Configure Package.json
  - [x] 1.1 Install runtime dependencies: `@nestjs/config ^4.x`, `zod ^3.x`, `@prisma/client ^6.x`, `@nestjs/bullmq ^11.x`, `bullmq ^5.x`, `ioredis ^5.x`, `helmet ^8.x`, `class-validator`, `class-transformer`
  - [x] 1.2 Install dev dependency: `prisma ^6.x`
  - [x] 1.3 Verify `package.json` scripts include `start:dev`, `build`, `test`, `test:cov`; add `"prisma:generate": "prisma generate"` and `"prisma:migrate": "prisma migrate dev"` scripts
  - [x] 1.4 Run `npm install` and confirm no peer dependency errors
  - Requires: Requirements 1, 2, 3, 4, 8

- [ ] 2. Create Environment Validation (Zod Schema)
  - [ ] 2.1 Create `src/config/env.schema.ts` with `envSchema` using `z.object()`:
    - `DATABASE_URL`: `z.string().url().startsWith('postgresql://')`
    - `REDIS_URL`: `z.string().url().startsWith('rediss://')`
    - `JWT_ACCESS_SECRET`: `z.string().min(32)`
    - `JWT_REFRESH_SECRET`: `z.string().min(32)`
    - `CSRF_SECRET`: `z.string().min(32)`
    - `NODE_ENV`: `z.enum(['development', 'production', 'test']).default('development')`
    - `PORT`: `z.string().transform(val => parseInt(val, 10)).pipe(z.number().int().min(1).max(65535)).default('3000')`
    - `ALLOWED_ORIGIN`: `z.string().url()`
  - [ ] 2.2 Export `EnvConfig` type as `z.infer<typeof envSchema>`
  - [ ] 2.3 Create `src/config/env.validation.ts` with `validate(config: Record<string, unknown>)` function:
    - Call `envSchema.safeParse(config)`
    - On failure: collect all `issue.path` + `issue.message` pairs and throw a single `Error` naming each failing variable
    - On success: return `result.data as Record<string, unknown>`
  - [ ] 2.4 Confirm no default values are set for `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`
  - Requires: Requirements 1.1–1.12

- [ ] 3. Create Prisma Schema and Run Migration
  - [ ] 3.1 Create `prisma/schema.prisma` with generator and datasource blocks (provider `prisma-client-js`, `DATABASE_URL` from env)
  - [ ] 3.2 Define all enums: `Role` (OWNER/STAFF), `UserStatus` (ACTIVE/INVITED/DISABLED), `TransactionType` (MASUK/KELUAR/TRANSFER), `TransactionStatus` (CONFIRMED/VOID), `TransactionSourceType` (MANUAL/IMPORT_OCR), `AuditAction` (CREATE/UPDATE/DELETE)
  - [ ] 3.3 Define model `Business`: `id` (cuid), `name`, `baseCurrency` (`@db.Char(3)` default "IDR"), `createdAt`, `updatedAt`, `deletedAt` (nullable), relations to User/Account/Category/Transaction/ExchangeRate/AuditLog, `@@index([deletedAt])`
  - [ ] 3.4 Define model `User`: `id` (cuid), `businessId`, `email` (`@unique`), `passwordHash`, `role` (Role enum), `status` (UserStatus default ACTIVE), `createdAt`, `updatedAt`, `deletedAt` (nullable), Business relation, `@@index([businessId])`, `@@index([email])`, `@@index([deletedAt])`
  - [ ] 3.5 Define model `Account`: `id` (cuid), `businessId`, `name`, `currency` (`@db.Char(3)`), `balance` (`Decimal @db.Decimal(15,2)`), `createdAt`, `updatedAt`, `deletedAt` (nullable), Business relation, two Transaction relations ("AccountTransactions" and "CounterAccountTransactions"), `@@index([businessId])`, `@@index([currency])`, `@@index([deletedAt])`
  - [ ] 3.6 Define model `Category`: `id` (cuid), `businessId`, `name`, `isDefault` (Boolean default false), `createdAt`, `updatedAt`, `deletedAt` (nullable), Business relation, Transaction relation, `@@index([businessId])`, `@@index([deletedAt])`
  - [ ] 3.7 Define model `Transaction` with ALL fields:
    - `id` (cuid), `businessId`, `accountId`, `categoryId` (nullable), `userId`
    - `type` (TransactionType), `amount` (`Decimal @db.Decimal(15,2)`), `currency` (`@db.Char(3)`)
    - `counterAccountId` (nullable), `counterAmount` (`Decimal? @db.Decimal(15,2)`), `counterCurrency` (`@db.Char(3)?`)
    - `exchangeRateUsed` (`Decimal? @db.Decimal(18,6)`)
    - `description` (nullable), `occurredAt`, `sourceType` (TransactionSourceType default MANUAL), `status` (TransactionStatus default CONFIRMED)
    - `idempotencyKey` (`@unique` nullable), `createdAt`, `updatedAt`, `deletedAt` (nullable)
    - Relations: Business, Account ("AccountTransactions"), Account? ("CounterAccountTransactions"), Category?, User
    - Indexes: `@@index([businessId])`, `@@index([accountId])`, `@@index([occurredAt])`, `@@index([status])`, `@@index([deletedAt])`, `@@index([idempotencyKey])`
  - [ ] 3.8 Define model `ExchangeRate`: `id` (cuid), `businessId`, `fromCurrency` (`@db.Char(3)`), `toCurrency` (`@db.Char(3)`), `rate` (`Decimal @db.Decimal(18,6)`), `effectiveDate`, `createdAt`, `updatedAt` — NO `deletedAt`, Business relation, `@@index([businessId])`, `@@index([fromCurrency, toCurrency, effectiveDate])`
  - [ ] 3.9 Define model `AuditLog`: `id` (cuid), `businessId`, `userId` (nullable), `entityType`, `entityId`, `action` (AuditAction), `beforeState` (Json nullable), `afterState` (Json nullable), `createdAt` only — NO `updatedAt`, NO `deletedAt` (append-only), Business/User? relations, `@@index([businessId])`, `@@index([entityType, entityId])`, `@@index([createdAt])`
  - [ ] 3.10 Verify ZERO monetary columns use `Float` or `Int` — all must be `Decimal @db.Decimal(15,2)` or `Decimal @db.Decimal(18,6)`
  - [ ] 3.11 Create `.env.example` with all required env var keys and placeholder (non-secret) values — no real credentials
  - [ ] 3.12 Run `npx prisma generate` to generate the Prisma Client
  - [ ] 3.13 Run `npx prisma migrate dev --name init` to create and apply the first migration
  - Requires: Requirements 2.1–2.12

- [ ] 4. Create PrismaModule and PrismaService
  - [ ] 4.1 Create `src/modules/prisma/prisma.service.ts`:
    - `@Injectable() export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy`
    - `onModuleInit()`: calls `this.$connect()`, logs "Database connection established"
    - `onModuleDestroy()`: calls `this.$disconnect()`, logs "Database connection closed"
    - `pingDatabase()`: executes `` this.$queryRaw`SELECT 1` `` and returns `true`
  - [ ] 4.2 Create `src/modules/prisma/prisma.module.ts`:
    - Decorated with `@Global()` so it does not need to be imported in every module
    - Providers: `[PrismaService]`
    - Exports: `[PrismaService]`
  - Requires: Requirements 2.1, 2.2, 2.12

- [ ] 5. Create Currency Constants
  - [ ] 5.1 Create `src/common/constants/currency.constants.ts`
  - [ ] 5.2 Define `export const SUPPORTED_CURRENCIES = ['IDR', 'USD', 'SGD', 'MYR', 'EUR', 'CNY', 'AUD'] as const` — exactly 7 codes in this order
  - [ ] 5.3 Export `export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number]`
  - [ ] 5.4 Confirm no other file duplicates this list
  - Requires: Requirements 9.1–9.5

- [ ] 6. Create GlobalExceptionFilter
  - [ ] 6.1 Create `src/common/filters/global-exception.filter.ts`
  - [ ] 6.2 Decorate with `@Catch()` (no argument — catches everything) and implement `ExceptionFilter`
  - [ ] 6.3 For `HttpException`: extract `statusCode` via `exception.getStatus()`, extract `errorCode` from response body if present (preserve custom `errorCode`), fall back to `statusToErrorCode(statusCode)` mapping; extract `message` from response body
  - [ ] 6.4 Implement `statusToErrorCode(status: number)` private method with mapping: 400→BAD_REQUEST, 401→UNAUTHORIZED, 403→FORBIDDEN, 404→NOT_FOUND, 409→CONFLICT, 422→UNPROCESSABLE_ENTITY, 429→TOO_MANY_REQUESTS, 503→SERVICE_UNAVAILABLE; default→INTERNAL_SERVER_ERROR
  - [ ] 6.5 For unknown exceptions: set `statusCode=500`, `errorCode='INTERNAL_SERVER_ERROR'`, `message='Terjadi kesalahan pada server. Coba lagi dalam beberapa saat.'`; call `this.logger.error()` with full stack trace (server-side only)
  - [ ] 6.6 Always respond with JSON `{ statusCode, errorCode, message, timestamp: new Date().toISOString() }` — never expose stack traces in the response body
  - Requires: Requirements 7.1–7.7

- [ ] 7. Create HealthModule (HealthService + HealthController)
  - [ ] 7.1 Create `src/modules/health/health.service.ts`:
    - Export interfaces `ServiceCheck` and `HealthStatus` (as per design.md)
    - Inject `PrismaService` and `@InjectQueue('ocr-processing') Queue`
    - `check()`: calls `Promise.all([checkDatabase(), checkRedis()])`, derives aggregate `status` (ok/degraded/error), returns `HealthStatus` with ISO 8601 timestamp
    - `checkDatabase()`: measures `Date.now()` diff around `this.prisma.pingDatabase()`; on error returns `{ status: 'error', error: err.message }` (no stack trace)
    - `checkRedis()`: measures `Date.now()` diff around `(await this.ocrQueue.client).ping()`; on error returns `{ status: 'error', error: err.message }` (no stack trace)
  - [ ] 7.2 Create `src/modules/health/health.controller.ts`:
    - `@Controller('health')`, method `@Get() @HttpCode(HttpStatus.OK) async check()`
    - Calls only `this.healthService.check()` — zero business logic in controller
    - If `result.status === 'error'` or `result.status === 'degraded'`: throw `new ServiceUnavailableException(result)` so `GlobalExceptionFilter` handles the 503
    - Otherwise return the `HealthStatus` object directly
  - [ ] 7.3 Create `src/modules/health/health.module.ts`:
    - Imports: `BullModule.registerQueue({ name: 'ocr-processing' })`, `PrismaModule`
    - Providers: `[HealthService]`
    - Controllers: `[HealthController]`
  - Requires: Requirements 6.1–6.9

- [ ] 8. Update AppModule
  - [ ] 8.1 Replace content of `src/app.module.ts`:
    - Import `ConfigModule.forRoot({ isGlobal: true, validate })` as the FIRST import
    - Import `PrismaModule` (already global, but must be listed)
    - Import `BullModule.forRootAsync({ useFactory: () => ({ connection: { url: process.env['REDIS_URL'], maxRetriesPerRequest: null, enableReadyCheck: false } }) })`
    - Import `BullModule.registerQueue({ name: 'ocr-processing' })`
    - Import `HealthModule`
  - [ ] 8.2 Remove `AppController` and `AppService` from module metadata (controllers, providers arrays) and delete `src/app.controller.ts`, `src/app.service.ts`, `src/app.controller.spec.ts`
  - Requires: Requirements 1.12, 3.1–3.7

- [ ] 9. Update main.ts Bootstrap
  - [ ] 9.1 Replace content of `src/main.ts` with bootstrap sequence in this order:
    1. `app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], connectSrc: ["'self'"], imgSrc: ["'self'", 'https://res.cloudinary.com'] } } }))` — FIRST, before everything
    2. Get `ConfigService` via `app.get(ConfigService)`
    3. `app.enableCors({ origin: configService.get<string>('ALLOWED_ORIGIN'), credentials: true })` — no wildcard
    4. `app.setGlobalPrefix('api/v1')`
    5. `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))`
    6. `app.useGlobalFilters(new GlobalExceptionFilter())`
    7. `await app.listen(configService.get<number>('PORT') ?? 3000)`
  - [ ] 9.2 Verify `helmet()` middleware is applied before `enableCors`, `setGlobalPrefix`, and all pipes/filters
  - [ ] 9.3 Confirm no hardcoded port number — port always sourced from `ConfigService`
  - Requires: Requirements 4.1–4.6, 5.1–5.3, 8.1–8.5

- [ ] 10. Write Unit Tests for HealthService
  - [ ] 10.1 Create `src/modules/health/health.service.spec.ts` using `@nestjs/testing` `Test.createTestingModule()`
  - [ ] 10.2 Mock `PrismaService` with a spy on `pingDatabase()` method
  - [ ] 10.3 Mock the BullMQ `Queue` with `getQueueToken('ocr-processing')` — mock `client` property that resolves to an object with a `ping()` method
  - [ ] 10.4 Test case: both `pingDatabase()` and `queue.client.ping()` resolve → `check()` returns `status: 'ok'`, both services have `status: 'ok'`
  - [ ] 10.5 Test case: `pingDatabase()` rejects, `queue.client.ping()` resolves → `check()` returns `status: 'degraded'`, `services.database.status` is `'error'`, `services.redis.status` is `'ok'`
  - [ ] 10.6 Test case: `pingDatabase()` resolves, `queue.client.ping()` rejects → `check()` returns `status: 'degraded'`, `services.redis.status` is `'error'`, `services.database.status` is `'ok'`
  - [ ] 10.7 Test case: both reject → `check()` returns `status: 'error'`, both services have `status: 'error'`
  - [ ] 10.8 Test case: on success, verify `latencyMs` is a non-negative number (`>= 0`) for both services
  - [ ] 10.9 Test case: on failure, verify `services.database.error` and/or `services.redis.error` contain only a message string — no stack trace substring (no "at " lines)
  - [ ] 10.10 Run `npm test -- --testPathPattern=health.service.spec --run` and confirm all tests pass
  - Requires: Requirements 6.3–6.9

- [ ] 11. Write Unit Tests for GlobalExceptionFilter
  - [~] 11.1 Create `src/common/filters/global-exception.filter.spec.ts`
  - [~] 11.2 Create a helper that builds a mock `ArgumentsHost` with a mock Express `Response` (spy on `.status().json()`)
  - [~] 11.3 Test case: throw `new HttpException('Bad input', 400)` → response has `statusCode: 400`, `errorCode: 'BAD_REQUEST'`, timestamp is valid ISO 8601
  - [~] 11.4 Test case: throw `new HttpException({ errorCode: 'DUPLICATE_EMAIL', message: 'Email sudah terdaftar.' }, 409)` → `errorCode` in response is `'DUPLICATE_EMAIL'` (custom code preserved, not overwritten by mapping)
  - [~] 11.5 Test case: throw a plain `new Error('something broke')` (non-HttpException) → `statusCode: 500`, `errorCode: 'INTERNAL_SERVER_ERROR'`, message is the standard Indonesian server error string
  - [~] 11.6 Test case: verify the JSON response body never contains a `stack` property for any exception type
  - [~] 11.7 Test case: verify response format always includes all four fields: `statusCode`, `errorCode`, `message`, `timestamp`
  - [~] 11.8 Run `npm test -- --testPathPattern=global-exception.filter.spec --run` and confirm all tests pass
  - Requires: Requirements 7.1–7.7

- [ ] 12. Write Unit Tests for validate() (Env Validation)
  - [~] 12.1 Create `src/config/env.validation.spec.ts`
  - [~] 12.2 Define a `validConfig` object with all required env vars set to valid values (use dummy 32+ char secrets, valid URLs)
  - [~] 12.3 Test case: `validate(validConfig)` returns an object without throwing; returned object contains `PORT` as a number (not string)
  - [~] 12.4 Test case: `validate({...validConfig, DATABASE_URL: undefined})` throws; error message contains `DATABASE_URL`
  - [~] 12.5 Test case: `validate({...validConfig, REDIS_URL: 'redis://localhost:6379'})` (single-s, no TLS) throws; error message contains `REDIS_URL`
  - [~] 12.6 Test case: `validate({...validConfig, JWT_ACCESS_SECRET: 'tooshort'})` (< 32 chars) throws; error message contains `JWT_ACCESS_SECRET`
  - [~] 12.7 Test case: `validate({...validConfig, PORT: '0'})` throws (below minimum 1); test also for `'65536'` (above maximum 65535)
  - [~] 12.8 Test case: `validate({...validConfig, NODE_ENV: 'staging'})` throws (not in enum)
  - [~] 12.9 Test case: `validate({...validConfig, ALLOWED_ORIGIN: 'not-a-url'})` throws; error message contains `ALLOWED_ORIGIN`
  - [~] 12.10 Run `npm test -- --testPathPattern=env.validation.spec --run` and confirm all tests pass
  - Requires: Requirements 1.1–1.11

- [ ] 13. Update README.md
  - [~] 13.1 Replace `README.md` content with:
    - **Project overview** (one paragraph: NestJS backend, UMKM Finance Tracker, Phase 0)
    - **Prerequisites** section: Node.js 20+, PostgreSQL (Supabase), Redis (Upstash with TLS)
    - **Setup instructions** (numbered steps): (1) `npm install`, (2) copy `.env.example` to `.env` and fill in all values, (3) `npx prisma migrate dev`, (4) `npm run start:dev`
    - **Environment Variables** table with columns `Variable`, `Required`, `Description` — one row per env var (DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, CSRF_SECRET, ALLOWED_ORIGIN, NODE_ENV, PORT)
    - **Health Check** section: `GET /api/v1/health` — show example 200 response and example 503 degraded response
    - **Running Tests** section: `npm test`, `npm run test:cov`
  - [~] 13.2 Confirm no Docker instructions are included
  - Requires: (none — project hygiene)

## Notes

- Task 1 must complete before all other tasks — all packages must be installed first.
- Tasks 2, 3, and 5 can be developed in parallel after Task 1.
- Task 4 depends on Task 3 (`prisma generate` must succeed before writing PrismaService).
- Tasks 6–9 depend on Tasks 2, 3, 4, and 5 all being complete.
- Task 8 (AppModule) should be updated after Tasks 2–7 to avoid import resolution errors.
- Task 9 (main.ts) should be the last code change before running the integration smoke test.
- Tasks 10, 11, 12 are independent of each other and can run in parallel once their respective source tasks are done.
- Task 13 (README) has no code dependency and can be written any time after Task 9.
- Always run `npm test` after completing Tasks 10–12 to confirm the full test suite is green before marking Phase 0 complete.

import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgresql://', {
    message:
      'DATABASE_URL must be a PostgreSQL connection string starting with postgresql://',
  }),

  REDIS_URL: z.string().url().startsWith('rediss://', {
    message: 'REDIS_URL must use rediss:// protocol (TLS required for Upstash)',
  }),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' }),

  JWT_REFRESH_SECRET: z
    .string()
    .min(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' }),

  CSRF_SECRET: z
    .string()
    .min(32, { message: 'CSRF_SECRET must be at least 32 characters' }),

  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  PORT: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1).max(65535))
    .default('3000'),

  ALLOWED_ORIGIN: z.string().url({
    message: 'ALLOWED_ORIGIN must be a valid URL (e.g., http://localhost:3001)',
  }),

  // ─── Cloudinary (optional — tanpa ini pakai dummy storage) ───────────────
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // ─── Mindee OCR (optional — tanpa ini pakai dummy OCR) ───────────────────
  MINDEE_API_KEY: z.string().optional(),

  // ─── Azure Computer Vision (optional — fallback dari Mindee) ─────────────
  AZURE_VISION_ENDPOINT: z.string().url().optional(),
  AZURE_VISION_KEY: z.string().optional(),

  // ─── Google Gemini (optional — AI-powered OCR provider) ──────────────────
  GEMINI_API_KEY: z.string().optional(),

  // ─── Google Cloud Vision (optional — OCR provider via API key atau SA) ───
  GOOGLE_CLOUD_VISION_API_KEY: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  // ─── Tesseract (optional — local OCR provider) ───────────────────────────
  TESSERACT_LANG: z.string().default('ind+eng'),

  // ─── WhatsApp Business API (optional) ────────────────────────────────────
  WA_VERIFY_TOKEN: z.string().optional(),
  WA_ACCESS_TOKEN: z.string().optional(),
  WA_PHONE_NUMBER_ID: z.string().optional(),
  WA_APP_SECRET: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

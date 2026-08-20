import { envSchema } from './env.schema';

export function validate(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `\n\n❌ Environment validation failed:\n${formatted}\n\nCheck your .env file.\n`,
    );
  }

  return result.data;
}

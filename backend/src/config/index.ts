import { z } from 'zod';

// Environment schema validation
const envSchema = z.object({
  // Server
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('localhost'),
  API_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // Database
  DATABASE_URL: z.string().min(1),

  // Valkey (Redis)
  VALKEY_URL: z.string().default('valkey://localhost:6379'),

  // Authentication
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().optional(),

  // Session
  SESSION_MAX_AGE: z.coerce.number().default(604800), // 7 days
  SESSION_UPDATE_AGE: z.coerce.number().default(86400), // 1 day

  // OAuth (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Email
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('InsightDesk <noreply@example.com>'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
});

// Parse and validate environment
function loadConfig() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.format());
    process.exit(1);
  }

  return parsed.data;
}

export const config = loadConfig();

// Derived config
export const isDev = config.NODE_ENV === 'development';
export const isProd = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';

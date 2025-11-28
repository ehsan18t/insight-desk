import { z } from "zod";

// Environment schema validation
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(["development", "production", "test"]).prefault("development"),
  PORT: z.coerce.number().prefault(3001),
  HOST: z.string().prefault("localhost"),
  API_URL: z.url().optional(),
  FRONTEND_URL: z.url().prefault("http://localhost:3000"),

  // Database
  DATABASE_URL: z.string().min(1),

  // Valkey (Redis)
  VALKEY_URL: z.string().prefault("valkey://localhost:6379"),

  // Authentication
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().optional(),

  // Session
  SESSION_MAX_AGE: z.coerce.number().prefault(604800), // 7 days
  SESSION_UPDATE_AGE: z.coerce.number().prefault(86400), // 1 day

  // OAuth (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Email (SMTP)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().prefault(587),
  SMTP_SECURE: z.stringbool().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().prefault("InsightDesk <noreply@example.com>"),

  // Logging
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).prefault("info"),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().prefault(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().prefault(100),

  // File Storage
  STORAGE_PROVIDER: z.enum(["local", "s3", "r2"]).prefault("local"),
  STORAGE_LOCAL_PATH: z.string().prefault("./uploads"),

  // S3/R2 Config (optional, required if STORAGE_PROVIDER is s3 or r2)
  STORAGE_S3_BUCKET: z.string().optional(),
  STORAGE_S3_REGION: z.string().prefault("us-east-1"),
  STORAGE_S3_ACCESS_KEY: z.string().optional(),
  STORAGE_S3_SECRET_KEY: z.string().optional(),
  STORAGE_S3_ENDPOINT: z.string().optional(), // For R2 or S3-compatible

  // File upload limits
  MAX_FILE_SIZE: z.coerce.number().prefault(10 * 1024 * 1024), // 10MB
  ALLOWED_FILE_TYPES: z.string().prefault("image/*,application/pdf,.doc,.docx,.txt,.csv,.xlsx"),
});

// Parse and validate environment
function loadConfig() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(z.treeifyError(parsed.error));
    process.exit(1);
  }

  return parsed.data;
}

export const config = loadConfig();

// Derived config
export const isDev = config.NODE_ENV === "development";
export const isProd = config.NODE_ENV === "production";
export const isTest = config.NODE_ENV === "test";

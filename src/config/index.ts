import { z } from "zod";

// Environment schema validation
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("localhost"),
  API_URL: z.url().optional(),
  FRONTEND_URL: z.url().default("http://localhost:3000"),

  // Database
  DATABASE_URL: z.string().min(1),

  // Valkey (Redis)
  VALKEY_URL: z.string().default("valkey://localhost:6379"),

  // Authentication
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().optional(),

  // Session
  SESSION_MAX_AGE: z.coerce.number().default(604800), // 7 days
  SESSION_UPDATE_AGE: z.coerce.number().default(86400), // 1 day

  // OAuth (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // Email (SMTP)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.stringbool().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default("InsightDesk <noreply@example.com>"),

  // Logging
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // File Storage
  STORAGE_PROVIDER: z.enum(["local", "s3", "r2"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./uploads"),

  // S3/R2 Config (optional, required if STORAGE_PROVIDER is s3 or r2)
  STORAGE_S3_BUCKET: z.string().optional(),
  STORAGE_S3_REGION: z.string().default("us-east-1"),
  STORAGE_S3_ACCESS_KEY: z.string().optional(),
  STORAGE_S3_SECRET_KEY: z.string().optional(),
  STORAGE_S3_ENDPOINT: z.string().optional(), // For R2 or S3-compatible

  // File upload limits
  MAX_FILE_SIZE: z.coerce.number().default(10 * 1024 * 1024), // 10MB
  ALLOWED_FILE_TYPES: z.string().default("image/*,application/pdf,.doc,.docx,.txt,.csv,.xlsx"),

  // API Documentation
  ENABLE_API_DOCS: z.stringbool().optional(), // Defaults based on NODE_ENV
  API_DOCS_PATH: z.string().default("/api-docs"),
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

// API docs enabled by default in development, disabled in production
export const isApiDocsEnabled = config.ENABLE_API_DOCS ?? !isProd;

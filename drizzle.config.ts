import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  // Disable strict mode in CI to avoid interactive prompts
  // strict: true causes drizzle-kit to prompt for confirmation before executing SQL
  // In CI environments, stdin is not connected so the prompt hangs/fails
  strict: process.env.CI !== "true",
  entities: {
    // Disable role management entirely - drizzle-kit tries to drop system roles otherwise
    // Our app_user and service_role are pre-created in setup scripts before schema push
    // and marked with .existing() in the schema so policies can reference them
    roles: false,
  },
});

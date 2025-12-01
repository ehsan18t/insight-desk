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
    // Exclude our RLS roles from drizzle-kit management
    // These roles are created manually in setup scripts before schema push
    // We must exclude rather than disable (roles: false) because policies reference these roles
    roles: {
      exclude: ["app_user", "service_role"],
    },
  },
});

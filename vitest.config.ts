import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],

    // Setup files run before each test file
    setupFiles: ["./src/test/setup.ts"],

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      exclude: [
        "node_modules",
        "src/test",
        "**/*.d.ts",
        "**/*.config.ts",
        "src/seed.ts",
        "drizzle/**",
      ],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
      },
    },

    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,

    // Run tests sequentially for database tests
    sequence: {
      shuffle: false,
    },
    fileParallelism: false,

    // Reporter
    reporters: ["verbose"],
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

/**
 * Integration Test Services
 *
 * Utilities for connecting to and managing real external services
 * (PostgreSQL, Valkey, MinIO, Mailpit) during integration tests.
 */

import { execSync, spawn } from "node:child_process";

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

export const TEST_CONFIG = {
  // Docker compose file for test containers
  composeFile: "docker-compose.test.yml",

  // Container names (from docker-compose.test.yml)
  containers: {
    postgres: "insightdesk-postgres-test",
    valkey: "insightdesk-valkey-test",
    minio: "insightdesk-minio-test",
    mailpit: "insightdesk-mailpit-test",
  },

  // Connection settings (from .env.test)
  postgres: {
    host: "localhost",
    port: 5433,
    user: "insightdesk",
    password: "insightdesk_test",
    database: "insightdesk_test",
  },

  valkey: {
    host: "localhost",
    port: 6380,
  },

  minio: {
    endpoint: "http://localhost:9002",
    accessKey: "minioadmin",
    secretKey: "minioadmin",
    bucket: "insightdesk-test",
  },

  mailpit: {
    smtpHost: "localhost",
    smtpPort: 1026,
    apiUrl: "http://localhost:8026",
  },
};

// ─────────────────────────────────────────────────────────────
// Container Management
// ─────────────────────────────────────────────────────────────

/**
 * Check if a specific container is running
 */
export function isContainerRunning(containerName: string): boolean {
  try {
    const result = execSync(`docker inspect -f "{{.State.Running}}" ${containerName}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Check if all test containers are running
 */
export function areAllContainersRunning(): boolean {
  return Object.values(TEST_CONFIG.containers).every(isContainerRunning);
}

/**
 * Get status of all test containers
 */
export function getContainersStatus(): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(TEST_CONFIG.containers).map(([name, container]) => [
      name,
      isContainerRunning(container),
    ]),
  );
}

/**
 * Start test containers using docker compose
 */
export async function startTestContainers(): Promise<void> {
  console.log("🐳 Starting test containers...");

  return new Promise((resolve, reject) => {
    const proc = spawn("docker", ["compose", "-f", TEST_CONFIG.composeFile, "up", "-d"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    proc.on("close", (code) => {
      if (code === 0) {
        console.log("   ✅ Test containers started");
        resolve();
      } else {
        reject(new Error(`docker compose up failed with code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}

/**
 * Stop test containers
 */
export async function stopTestContainers(): Promise<void> {
  console.log("🛑 Stopping test containers...");

  return new Promise((resolve, reject) => {
    const proc = spawn("docker", ["compose", "-f", TEST_CONFIG.composeFile, "down"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    proc.on("close", (code) => {
      if (code === 0) {
        console.log("   ✅ Test containers stopped");
        resolve();
      } else {
        reject(new Error(`docker compose down failed with code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────
// Health Checks
// ─────────────────────────────────────────────────────────────

/**
 * Wait for PostgreSQL to be ready
 */
export async function waitForPostgres(maxAttempts = 30): Promise<void> {
  console.log("⏳ Waiting for PostgreSQL...");

  for (let i = 0; i < maxAttempts; i++) {
    try {
      execSync(
        `docker exec ${TEST_CONFIG.containers.postgres} pg_isready -U ${TEST_CONFIG.postgres.user} -d ${TEST_CONFIG.postgres.database}`,
        { stdio: "pipe" },
      );
      console.log("   ✅ PostgreSQL is ready");
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("PostgreSQL failed to become ready");
}

/**
 * Wait for Valkey to be ready
 */
export async function waitForValkey(maxAttempts = 30): Promise<void> {
  console.log("⏳ Waiting for Valkey...");

  for (let i = 0; i < maxAttempts; i++) {
    try {
      execSync(`docker exec ${TEST_CONFIG.containers.valkey} valkey-cli ping`, { stdio: "pipe" });
      console.log("   ✅ Valkey is ready");
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("Valkey failed to become ready");
}

/**
 * Wait for MinIO to be ready
 */
export async function waitForMinio(maxAttempts = 30): Promise<void> {
  console.log("⏳ Waiting for MinIO...");

  for (let i = 0; i < maxAttempts; i++) {
    try {
      // MinIO mc ready command
      execSync(`docker exec ${TEST_CONFIG.containers.minio} mc ready local 2>/dev/null || true`, {
        stdio: "pipe",
      });
      // Also try a simple HTTP check
      const response = await fetch(`${TEST_CONFIG.minio.endpoint}/minio/health/live`);
      if (response.ok) {
        console.log("   ✅ MinIO is ready");
        return;
      }
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("MinIO failed to become ready");
}

/**
 * Wait for Mailpit to be ready
 */
export async function waitForMailpit(maxAttempts = 30): Promise<void> {
  console.log("⏳ Waiting for Mailpit...");

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${TEST_CONFIG.mailpit.apiUrl}/api/v1/messages`);
      if (response.ok) {
        console.log("   ✅ Mailpit is ready");
        return;
      }
    } catch {
      await sleep(1000);
    }
  }
  throw new Error("Mailpit failed to become ready");
}

/**
 * Wait for all services to be ready
 */
export async function waitForAllServices(): Promise<void> {
  await waitForPostgres();
  await waitForValkey();
  await waitForMinio();
  await waitForMailpit();
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute SQL in test PostgreSQL container
 */
export async function execSql(sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "docker",
      [
        "exec",
        "-i",
        TEST_CONFIG.containers.postgres,
        "psql",
        "-U",
        TEST_CONFIG.postgres.user,
        "-d",
        TEST_CONFIG.postgres.database,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0 && stderr && !stderr.includes("NOTICE:")) {
        reject(new Error(stderr || `Process exited with code ${code}`));
      } else {
        resolve(stdout);
      }
    });

    proc.on("error", reject);

    proc.stdin.write(sql);
    proc.stdin.end();
  });
}

/**
 * Execute Valkey command in test container
 */
export function execValkey(command: string): string {
  return execSync(`docker exec ${TEST_CONFIG.containers.valkey} valkey-cli ${command}`, {
    encoding: "utf-8",
  });
}

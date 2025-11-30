/**
 * Vitest Global Setup
 *
 * Runs once before all test files.
 * For integration tests: starts Docker containers and waits for them to be healthy.
 * Returns a teardown function to stop containers after all tests complete.
 */

import { execSync, spawn } from "node:child_process";

const TEST_CONTAINERS = [
  "insightdesk-postgres-test",
  "insightdesk-valkey-test",
  "insightdesk-minio-test",
  "insightdesk-mailpit-test",
];

const COMPOSE_FILE = "docker-compose.test.yml";
const HEALTH_CHECK_TIMEOUT = 60000; // 60 seconds
const HEALTH_CHECK_INTERVAL = 1000; // 1 second

// By default, stop containers after tests complete
// Set AUTO_STOP_TEST_CONTAINERS=false to keep containers running for faster re-runs
const AUTO_STOP_CONTAINERS = process.env.AUTO_STOP_TEST_CONTAINERS !== "false";

function isContainerRunning(containerName: string): boolean {
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

function isContainerHealthy(containerName: string): boolean {
  try {
    const result = execSync(`docker inspect -f "{{.State.Health.Status}}" ${containerName}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim() === "healthy";
  } catch {
    // Container might not have health check defined
    return isContainerRunning(containerName);
  }
}

function areAllContainersHealthy(): boolean {
  return TEST_CONTAINERS.every(isContainerHealthy);
}

async function startContainers(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log("🐳 Starting test containers...");

    const proc = spawn("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d"], {
      stdio: "inherit",
      cwd: process.cwd(),
      shell: true,
    });

    proc.on("close", (code) => {
      if (code === 0) {
        console.log("   ✅ Containers started");
        resolve();
      } else {
        reject(new Error(`docker compose up failed with code ${code}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start containers: ${err.message}`));
    });
  });
}

async function stopContainers(): Promise<void> {
  return new Promise((resolve) => {
    console.log("\n🐳 Stopping test containers...");

    const proc = spawn("docker", ["compose", "-f", COMPOSE_FILE, "down"], {
      stdio: "inherit",
      cwd: process.cwd(),
      shell: true,
    });

    proc.on("close", (code) => {
      if (code === 0) {
        console.log("   ✅ Containers stopped\n");
      } else {
        console.log(`   ⚠️ docker compose down exited with code ${code}\n`);
      }
      resolve();
    });

    proc.on("error", (err) => {
      console.log(`   ⚠️ Failed to stop containers: ${err.message}\n`);
      resolve(); // Don't fail teardown
    });
  });
}

async function waitForHealthy(): Promise<void> {
  console.log("🏥 Waiting for containers to be healthy...");

  const startTime = Date.now();

  while (Date.now() - startTime < HEALTH_CHECK_TIMEOUT) {
    if (areAllContainersHealthy()) {
      console.log("   ✅ All containers healthy");
      return;
    }

    // Log status of each container
    for (const container of TEST_CONTAINERS) {
      const running = isContainerRunning(container);
      const healthy = isContainerHealthy(container);
      if (!healthy) {
        console.log(
          `   ⏳ ${container}: ${running ? "running" : "stopped"}, ${healthy ? "healthy" : "waiting..."}`,
        );
      }
    }

    await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL));
  }

  throw new Error(`Containers did not become healthy within ${HEALTH_CHECK_TIMEOUT}ms`);
}

export default async function globalSetup(): Promise<(() => Promise<void>) | undefined> {
  // Only run container management for integration tests
  if (process.env.RUN_INTEGRATION_TESTS !== "true") {
    return;
  }

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║       Integration Test Environment Setup                 ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Check if containers are already running and healthy
  if (areAllContainersHealthy()) {
    console.log("✅ Test containers are already running and healthy\n");
  } else {
    // Start containers
    await startContainers();

    // Wait for containers to be healthy
    await waitForHealthy();

    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║       ✅ Integration Test Environment Ready              ║");
    console.log("╚══════════════════════════════════════════════════════════╝\n");
  }

  // Return teardown function
  return async () => {
    if (AUTO_STOP_CONTAINERS) {
      await stopContainers();
    } else {
      console.log("\n💡 Tip: Test containers are still running for faster re-runs.");
      console.log("   Run 'bun run test:containers:down' to stop them.\n");
    }
  };
}

#!/usr/bin/env node
/**
 * Project Setup Script
 *
 * Auto-detects the package manager and runs the full setup process.
 * Works with npm, yarn, pnpm, and bun.
 *
 * Usage:
 *   npx tsx scripts/setup.ts
 *   bunx tsx scripts/setup.ts
 *   pnpm tsx scripts/setup.ts
 */

import { execSync, spawn } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const projectRoot = join(import.meta.dirname, "..");

type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

/**
 * Detect which package manager is being used
 */
function detectPackageManager(): PackageManager {
  // Check for lockfiles in order of preference
  const lockFiles: Record<string, PackageManager> = {
    "bun.lockb": "bun",
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
    "package-lock.json": "npm",
  };

  for (const [lockFile, pm] of Object.entries(lockFiles)) {
    if (existsSync(join(projectRoot, lockFile))) {
      return pm;
    }
  }

  // Check npm_config_user_agent for the package manager that invoked the script
  const userAgent = process.env.npm_config_user_agent;
  if (userAgent) {
    if (userAgent.includes("bun")) return "bun";
    if (userAgent.includes("pnpm")) return "pnpm";
    if (userAgent.includes("yarn")) return "yarn";
  }

  // Default to npm
  return "npm";
}

/**
 * Get the run command for the detected package manager
 */
function getRunCommand(pm: PackageManager): string {
  switch (pm) {
    case "yarn":
      return "yarn";
    case "pnpm":
      return "pnpm";
    case "bun":
      return "bun run";
    default:
      return "npm run";
  }
}

/**
 * Get the install command for the detected package manager
 */
function getInstallCommand(pm: PackageManager): string {
  switch (pm) {
    case "yarn":
      return "yarn install";
    case "pnpm":
      return "pnpm install";
    case "bun":
      return "bun install";
    default:
      return "npm install";
  }
}

/**
 * Run a command and stream output
 */
function runCommand(command: string, description: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`\n📦 ${description}...`);
    console.log(`   Running: ${command}\n`);

    const isWindows = process.platform === "win32";
    const shell = isWindows ? "cmd.exe" : "/bin/sh";
    const shellFlag = isWindows ? "/c" : "-c";

    const child = spawn(shell, [shellFlag, command], {
      cwd: projectRoot,
      stdio: "inherit",
      env: process.env,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║           InsightDesk Project Setup                      ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const pm = detectPackageManager();
  const runCmd = getRunCommand(pm);
  const installCmd = getInstallCommand(pm);

  console.log(`\n🔍 Detected package manager: ${pm}`);

  try {
    // Step 1: Copy environment file
    console.log("\n📄 Setting up environment file...");
    const envSource = join(projectRoot, ".env.development");
    const envDest = join(projectRoot, ".env");

    if (existsSync(envSource)) {
      if (!existsSync(envDest)) {
        copyFileSync(envSource, envDest);
        console.log("   ✅ Copied .env.development to .env");
      } else {
        console.log("   ⏭️  .env already exists, skipping");
      }
    } else {
      console.log("   ⚠️  .env.development not found, skipping");
    }

    // Step 2: Install dependencies
    await runCommand(installCmd, "Installing dependencies");

    // Step 3: Start Docker services
    await runCommand(`${runCmd} docker:up`, "Starting Docker services");

    // Step 4: Wait for services to be ready
    console.log("\n⏳ Waiting for services to be ready...");
    await sleep(3000);

    // Step 5: Push database schema
    await runCommand(`${runCmd} db:push`, "Pushing database schema");

    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║           ✅ Setup Complete!                             ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
    console.log(`\nYou can now start the development server:`);
    console.log(`   ${runCmd} dev`);
    console.log("");
  } catch (error) {
    console.error("\n❌ Setup failed:", error);
    process.exit(1);
  }
}

main();

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

import { spawn } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  detectPackageManager,
  getRunCommand,
  getInstallCommand,
} from "../src/lib/utils/package-manager";

const projectRoot = join(import.meta.dirname, "..");

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

    // Step 6: Seed database with sample data
    await runCommand(`${runCmd} db:seed`, "Seeding database with sample data");

    console.log("\n╔══════════════════════════════════════════════════════════╗");
    console.log("║           ✅ Setup Complete!                             ║");
    console.log("╚══════════════════════════════════════════════════════════╝");
    console.log(`\nYou can now start the development server:`);
    console.log(`   ${runCmd} dev`);
    console.log(`\nTo use MCP with Claude Desktop, copy the config above to:`);
    console.log("   macOS: ~/Library/Application Support/Claude/claude_desktop_config.json");
    console.log("   Windows: %APPDATA%\\Claude\\claude_desktop_config.json");
    console.log(`\nTo regenerate MCP config later, run:`);
    console.log(`   ${runCmd} mcp:config`);
    console.log("");
  } catch (error) {
    console.error("\n❌ Setup failed:", error);
    process.exit(1);
  }
}

main();

/**
 * Package Manager Detection Utilities
 *
 * Auto-detects the package manager (bun, pnpm, yarn, npm) and provides
 * helper functions for running commands across all scripts.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

/**
 * Detect which package manager is being used based on lockfiles
 * and environment variables.
 *
 * @param projectRoot - The root directory of the project (defaults to cwd)
 */
export function detectPackageManager(projectRoot?: string): PackageManager {
  const root = projectRoot ?? process.cwd();

  // Check for lockfiles in order of preference
  const lockFiles: Record<string, PackageManager> = {
    "bun.lockb": "bun",
    "pnpm-lock.yaml": "pnpm",
    "yarn.lock": "yarn",
    "package-lock.json": "npm",
  };

  for (const [lockFile, pm] of Object.entries(lockFiles)) {
    if (existsSync(join(root, lockFile))) {
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
 * Get the run command prefix for the detected package manager
 *
 * @example
 * getRunCommand("bun") // "bun run"
 * getRunCommand("yarn") // "yarn"
 */
export function getRunCommand(pm: PackageManager): string {
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
 *
 * @example
 * getInstallCommand("bun") // "bun install"
 */
export function getInstallCommand(pm: PackageManager): string {
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
 * Get the execute command for running binaries (npx equivalent)
 *
 * @example
 * getExecCommand("bun") // "bunx"
 * getExecCommand("pnpm") // "pnpm dlx"
 */
export function getExecCommand(pm: PackageManager): string {
  switch (pm) {
    case "yarn":
      return "yarn dlx";
    case "pnpm":
      return "pnpm dlx";
    case "bun":
      return "bunx";
    default:
      return "npx";
  }
}

/**
 * Get the add dependency command for the detected package manager
 *
 * @example
 * getAddCommand("bun") // "bun add"
 */
export function getAddCommand(pm: PackageManager): string {
  switch (pm) {
    case "yarn":
      return "yarn add";
    case "pnpm":
      return "pnpm add";
    case "bun":
      return "bun add";
    default:
      return "npm install";
  }
}

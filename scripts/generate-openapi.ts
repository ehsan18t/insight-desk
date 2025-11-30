#!/usr/bin/env node
/**
 * Generate static OpenAPI documentation files
 *
 * This script generates openapi.json and openapi.yaml files in the docs/ directory
 * for static hosting or sharing with external tools.
 *
 * Usage:
 *   npm run docs:generate
 *   npx tsx scripts/generate-openapi.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stringify as yamlStringify } from "yaml";

// Import all OpenAPI registrations by importing the modules
import "../src/modules/attachments";
import "../src/modules/audit";
import "../src/modules/auth";
import "../src/modules/canned-responses";
import "../src/modules/categories";
import "../src/modules/csat";
import "../src/modules/dashboard";
import "../src/modules/export";
import "../src/modules/jobs";
import "../src/modules/messages";
import "../src/modules/organizations";
import "../src/modules/plans";
import "../src/modules/saved-filters";
import "../src/modules/sla";
import "../src/modules/subscriptions";
import "../src/modules/tags";
import "../src/modules/tickets";
import "../src/modules/users";

// Now import the generator (after all registrations)
import { generateOpenAPIDocument } from "../src/lib/openapi";

const DOCS_DIR = join(dirname(import.meta.dir), "docs");

async function main() {
  console.log("📝 Generating OpenAPI documentation...\n");

  // Generate the OpenAPI spec
  const spec = generateOpenAPIDocument();

  // Ensure docs directory exists
  await mkdir(DOCS_DIR, { recursive: true });

  // Write JSON
  const jsonPath = join(DOCS_DIR, "openapi.json");
  await writeFile(jsonPath, JSON.stringify(spec, null, 2), "utf-8");
  console.log(`✅ Generated: ${jsonPath}`);

  // Write YAML
  const yamlPath = join(DOCS_DIR, "openapi.yaml");
  await writeFile(yamlPath, yamlStringify(spec), "utf-8");
  console.log(`✅ Generated: ${yamlPath}`);

  // Count endpoints
  const paths = Object.keys(spec.paths || {});
  const operations = paths.reduce((count, path) => {
    const methods = Object.keys(spec.paths[path] || {}).filter((m) =>
      ["get", "post", "put", "patch", "delete"].includes(m),
    );
    return count + methods.length;
  }, 0);

  console.log(`\n📊 Summary:`);
  console.log(`   - Paths: ${paths.length}`);
  console.log(`   - Operations: ${operations}`);
  console.log(`   - Output: ${DOCS_DIR}/`);
  console.log(`\n🎉 Done!`);

  // Explicitly exit to avoid hanging on background connections
  process.exit(0);
}

main().catch((error) => {
  console.error("❌ Failed to generate OpenAPI docs:", error);
  process.exit(1);
});

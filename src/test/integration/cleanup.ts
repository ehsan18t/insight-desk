/**
 * Integration Test Cleanup Utilities
 *
 * Functions to clean up test data from external services
 * between test runs to ensure test isolation.
 */

import { execValkey, execSql, TEST_CONFIG } from "./services";

// ─────────────────────────────────────────────────────────────
// Database Cleanup
// ─────────────────────────────────────────────────────────────

/**
 * List of tables to truncate in order (respecting foreign key constraints)
 * Child tables must come before parent tables
 */
const TABLES_TO_TRUNCATE = [
  // Dependent tables first
  "ticket_activities",
  "ticket_messages",
  "attachments",
  "csat_surveys",
  "saved_filters",
  "canned_responses",
  "audit_logs",
  "subscription_usage",
  // Tickets depend on categories, tags, users
  "tickets",
  // Organization-related
  "organization_invitations",
  "organization_subscriptions",
  "user_organizations",
  "sla_policies",
  "categories",
  "tags",
  // Auth tables (managed by better-auth, be careful)
  "sessions",
  "accounts",
  "verifications",
  // Core tables last
  "users",
  "organizations",
];

/**
 * Truncate all test tables (fast, keeps schema)
 * Uses TRUNCATE CASCADE for efficiency
 */
export async function truncateAllTables(): Promise<void> {
  console.log("🗑️  Truncating test tables...");

  const sql = `TRUNCATE TABLE ${TABLES_TO_TRUNCATE.join(", ")} CASCADE;`;

  try {
    await execSql(sql);
    console.log(`   ✅ Truncated ${TABLES_TO_TRUNCATE.length} tables`);
  } catch (_error) {
    // Some tables might not exist, try one by one
    console.log("   ⚠️  Batch truncate failed, trying individual tables...");
    let truncated = 0;

    for (const table of TABLES_TO_TRUNCATE) {
      try {
        await execSql(`TRUNCATE TABLE ${table} CASCADE;`);
        truncated++;
      } catch {
        // Table doesn't exist, skip
      }
    }

    console.log(`   ✅ Truncated ${truncated} tables`);
  }
}

/**
 * Truncate specific tables
 */
export async function truncateTables(tables: string[]): Promise<void> {
  if (tables.length === 0) return;

  const sql = `TRUNCATE TABLE ${tables.join(", ")} CASCADE;`;
  await execSql(sql);
}

/**
 * Delete data from a specific table with optional WHERE clause
 */
export async function deleteFromTable(table: string, where?: string): Promise<void> {
  const sql = where ? `DELETE FROM ${table} WHERE ${where};` : `DELETE FROM ${table};`;
  await execSql(sql);
}

// ─────────────────────────────────────────────────────────────
// Valkey (Redis) Cleanup
// ─────────────────────────────────────────────────────────────

/**
 * Flush all data from Valkey test instance
 */
export function flushValkey(): void {
  console.log("🗑️  Flushing Valkey...");
  execValkey("FLUSHALL");
  console.log("   ✅ Valkey flushed");
}

/**
 * Delete keys matching a pattern
 */
export function deleteValkeyKeys(pattern: string): void {
  // Use SCAN to find keys, then DEL
  const keys = execValkey(`KEYS "${pattern}"`)
    .trim()
    .split("\n")
    .filter((k) => k);

  if (keys.length > 0) {
    execValkey(`DEL ${keys.join(" ")}`);
  }
}

/**
 * Get all keys (for debugging)
 */
export function getAllValkeyKeys(): string[] {
  return execValkey("KEYS *")
    .trim()
    .split("\n")
    .filter((k) => k);
}

// ─────────────────────────────────────────────────────────────
// MinIO (S3) Cleanup
// ─────────────────────────────────────────────────────────────

/**
 * Clear all objects from the test bucket
 */
export async function clearMinioBucket(): Promise<void> {
  console.log("🗑️  Clearing MinIO bucket...");

  const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = await import(
    "@aws-sdk/client-s3"
  );

  const client = new S3Client({
    endpoint: TEST_CONFIG.minio.endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: TEST_CONFIG.minio.accessKey,
      secretAccessKey: TEST_CONFIG.minio.secretKey,
    },
    forcePathStyle: true,
  });

  try {
    // List all objects
    const listResponse = await client.send(
      new ListObjectsV2Command({
        Bucket: TEST_CONFIG.minio.bucket,
      }),
    );

    if (listResponse.Contents && listResponse.Contents.length > 0) {
      // Delete all objects
      await client.send(
        new DeleteObjectsCommand({
          Bucket: TEST_CONFIG.minio.bucket,
          Delete: {
            Objects: listResponse.Contents.map((obj) => ({ Key: obj.Key })),
          },
        }),
      );

      console.log(`   ✅ Deleted ${listResponse.Contents.length} objects from MinIO`);
    } else {
      console.log("   ✅ MinIO bucket already empty");
    }
  } catch (_error) {
    // Bucket might not exist yet
    console.log("   ⚠️  MinIO bucket not accessible (might not exist yet)");
  }
}

/**
 * Ensure test bucket exists
 */
export async function ensureMinioBucket(): Promise<void> {
  const { S3Client, CreateBucketCommand, HeadBucketCommand } = await import("@aws-sdk/client-s3");

  const client = new S3Client({
    endpoint: TEST_CONFIG.minio.endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: TEST_CONFIG.minio.accessKey,
      secretAccessKey: TEST_CONFIG.minio.secretKey,
    },
    forcePathStyle: true,
  });

  try {
    // Check if bucket exists
    await client.send(new HeadBucketCommand({ Bucket: TEST_CONFIG.minio.bucket }));
    console.log(`   ✅ MinIO bucket '${TEST_CONFIG.minio.bucket}' exists`);
  } catch {
    // Create bucket
    await client.send(new CreateBucketCommand({ Bucket: TEST_CONFIG.minio.bucket }));
    console.log(`   ✅ Created MinIO bucket '${TEST_CONFIG.minio.bucket}'`);
  }
}

// ─────────────────────────────────────────────────────────────
// Mailpit Cleanup
// ─────────────────────────────────────────────────────────────

/**
 * Delete all messages from Mailpit
 */
export async function clearMailpit(): Promise<void> {
  console.log("🗑️  Clearing Mailpit messages...");

  try {
    const response = await fetch(`${TEST_CONFIG.mailpit.apiUrl}/api/v1/messages`, {
      method: "DELETE",
    });

    if (response.ok) {
      console.log("   ✅ Mailpit messages cleared");
    } else {
      console.log("   ⚠️  Failed to clear Mailpit messages");
    }
  } catch {
    console.log("   ⚠️  Mailpit not accessible");
  }
}

/**
 * Get all messages from Mailpit
 */
export async function getMailpitMessages(): Promise<MailpitMessage[]> {
  const response = await fetch(`${TEST_CONFIG.mailpit.apiUrl}/api/v1/messages`);
  const data = (await response.json()) as { messages: MailpitMessage[] };
  return data.messages || [];
}

/**
 * Get a specific message by ID
 */
export async function getMailpitMessage(id: string): Promise<MailpitMessageDetail | null> {
  try {
    const response = await fetch(`${TEST_CONFIG.mailpit.apiUrl}/api/v1/message/${id}`);
    if (response.ok) {
      return response.json() as Promise<MailpitMessageDetail>;
    }
  } catch {
    // Message not found
  }
  return null;
}

// Mailpit types
export interface MailpitMessage {
  ID: string;
  From: { Name: string; Address: string };
  To: Array<{ Name: string; Address: string }>;
  Subject: string;
  Created: string;
  Size: number;
}

export interface MailpitMessageDetail extends MailpitMessage {
  Text: string;
  HTML: string;
  Attachments: Array<{
    FileName: string;
    ContentType: string;
    Size: number;
  }>;
}

// ─────────────────────────────────────────────────────────────
// Full Cleanup
// ─────────────────────────────────────────────────────────────

/**
 * Clean all test data from all services
 * Call this between test files for complete isolation
 */
export async function cleanAllTestData(): Promise<void> {
  console.log("\n🧹 Cleaning all test data...\n");

  await truncateAllTables();
  flushValkey();
  await clearMinioBucket();
  await clearMailpit();

  console.log("\n✅ All test data cleaned\n");
}

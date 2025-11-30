/**
 * MinIO (S3) Integration Tests
 *
 * Tests real MinIO storage functionality including:
 * - File upload
 * - File download
 * - File deletion
 * - Pre-signed URLs
 * - Various file types
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  skipIntegrationTests,
  clearMinioBucket,
  ensureMinioBucket,
  TEST_CONFIG,
} from "@/test/integration";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

describe.skipIf(skipIntegrationTests())("MinIO Integration", () => {
  let s3Client: S3Client;
  const bucket = TEST_CONFIG.minio.bucket;

  beforeAll(async () => {
    // Create S3 client for MinIO
    s3Client = new S3Client({
      endpoint: TEST_CONFIG.minio.endpoint,
      region: "us-east-1",
      credentials: {
        accessKeyId: TEST_CONFIG.minio.accessKey,
        secretAccessKey: TEST_CONFIG.minio.secretKey,
      },
      forcePathStyle: true, // Required for MinIO
    });

    // Ensure bucket exists
    await ensureMinioBucket();
  });

  beforeEach(async () => {
    // Clear bucket before each test
    await clearMinioBucket();
  });

  afterAll(async () => {
    // Clean up
    await clearMinioBucket();
  });

  // ─────────────────────────────────────────────────────────────
  // Connection Tests
  // ─────────────────────────────────────────────────────────────

  describe("Connection", () => {
    it("should connect to MinIO successfully", async () => {
      const response = await fetch(`${TEST_CONFIG.minio.endpoint}/minio/health/live`);
      expect(response.ok).toBe(true);
    });

    it("should access the test bucket", async () => {
      const response = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          MaxKeys: 1,
        }),
      );
      expect(response.$metadata.httpStatusCode).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Upload Tests
  // ─────────────────────────────────────────────────────────────

  describe("Upload", () => {
    it("should upload a text file", async () => {
      const content = "Hello, MinIO!";
      const key = "test/hello.txt";

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: Buffer.from(content),
          ContentType: "text/plain",
        }),
      );

      // Verify upload
      const response = await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );

      expect(response.ContentLength).toBe(content.length);
      expect(response.ContentType).toBe("text/plain");
    });

    it("should upload a binary file", async () => {
      // Create a small PNG (1x1 transparent pixel)
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
      ]);

      const key = "test/image.png";

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: pngBuffer,
          ContentType: "image/png",
        }),
      );

      // Verify upload
      const response = await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );

      expect(response.ContentLength).toBe(pngBuffer.length);
      expect(response.ContentType).toBe("image/png");
    });

    it("should upload with custom metadata", async () => {
      const key = "test/with-metadata.txt";

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: Buffer.from("Content with metadata"),
          ContentType: "text/plain",
          Metadata: {
            "x-amz-meta-original-name": "document.txt",
            "x-amz-meta-uploaded-by": "test-user",
          },
        }),
      );

      const response = await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );

      expect(response.Metadata?.["x-amz-meta-original-name"]).toBe("document.txt");
      expect(response.Metadata?.["x-amz-meta-uploaded-by"]).toBe("test-user");
    });

    it("should upload to nested folders", async () => {
      const key = "org123/tickets/t456/attachments/file.pdf";

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: Buffer.from("PDF content"),
          ContentType: "application/pdf",
        }),
      );

      // Verify upload
      const response = await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );

      expect(response.$metadata.httpStatusCode).toBe(200);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Download Tests
  // ─────────────────────────────────────────────────────────────

  describe("Download", () => {
    it("should download a file", async () => {
      const content = "Download test content";
      const key = "test/download.txt";

      // Upload first
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: Buffer.from(content),
          ContentType: "text/plain",
        }),
      );

      // Download
      const response = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      const downloaded = Buffer.concat(chunks).toString("utf-8");

      expect(downloaded).toBe(content);
    });

    it("should return error for non-existent file", async () => {
      await expect(
        s3Client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: "non-existent-file.txt",
          }),
        ),
      ).rejects.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Delete Tests
  // ─────────────────────────────────────────────────────────────

  describe("Delete", () => {
    it("should delete a file", async () => {
      const key = "test/to-delete.txt";

      // Upload first
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: Buffer.from("Delete me"),
        }),
      );

      // Verify exists
      const headResponse = await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
      expect(headResponse.$metadata.httpStatusCode).toBe(200);

      // Delete
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );

      // Verify deleted
      await expect(
        s3Client.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        ),
      ).rejects.toThrow();
    });

    it("should not error when deleting non-existent file", async () => {
      // S3/MinIO doesn't throw error for deleting non-existent keys
      await expect(
        s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: "non-existent-file.txt",
          }),
        ),
      ).resolves.not.toThrow();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Pre-signed URL Tests
  // ─────────────────────────────────────────────────────────────

  describe("Pre-signed URLs", () => {
    it("should generate a pre-signed download URL", async () => {
      const content = "Pre-signed URL test";
      const key = "test/presigned.txt";

      // Upload
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: Buffer.from(content),
          ContentType: "text/plain",
        }),
      );

      // Generate pre-signed URL
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

      expect(presignedUrl).toContain(TEST_CONFIG.minio.endpoint.replace("http://", ""));
      expect(presignedUrl).toContain(key);
      expect(presignedUrl).toContain("X-Amz-Signature");

      // Verify URL is accessible
      const response = await fetch(presignedUrl);
      expect(response.ok).toBe(true);

      const downloaded = await response.text();
      expect(downloaded).toBe(content);
    });

    it("should generate a pre-signed upload URL", async () => {
      const key = "test/presigned-upload.txt";

      // Generate pre-signed upload URL
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: "text/plain",
      });
      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

      expect(presignedUrl).toContain("X-Amz-Signature");

      // Use pre-signed URL to upload
      const content = "Uploaded via pre-signed URL";
      const uploadResponse = await fetch(presignedUrl, {
        method: "PUT",
        body: content,
        headers: {
          "Content-Type": "text/plain",
        },
      });
      expect(uploadResponse.ok).toBe(true);

      // Verify upload
      const getResponse = await s3Client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );

      const chunks: Buffer[] = [];
      for await (const chunk of getResponse.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
      }
      const downloaded = Buffer.concat(chunks).toString("utf-8");
      expect(downloaded).toBe(content);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // List Objects Tests
  // ─────────────────────────────────────────────────────────────

  describe("List Objects", () => {
    it("should list objects in bucket", async () => {
      // Upload multiple files
      const files = ["a.txt", "b.txt", "c.txt"];
      for (const file of files) {
        await s3Client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `list-test/${file}`,
            Body: Buffer.from(`Content of ${file}`),
          }),
        );
      }

      // List objects
      const response = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: "list-test/",
        }),
      );

      expect(response.Contents).toHaveLength(3);
      const keys = response.Contents?.map((obj) => obj.Key) || [];
      expect(keys).toContain("list-test/a.txt");
      expect(keys).toContain("list-test/b.txt");
      expect(keys).toContain("list-test/c.txt");
    });

    it("should paginate large result sets", async () => {
      // Upload 5 files
      for (let i = 0; i < 5; i++) {
        await s3Client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `pagination-test/file${i}.txt`,
            Body: Buffer.from(`File ${i}`),
          }),
        );
      }

      // List with max 2 per page
      const page1 = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: "pagination-test/",
          MaxKeys: 2,
        }),
      );

      expect(page1.Contents).toHaveLength(2);
      expect(page1.IsTruncated).toBe(true);
      expect(page1.NextContinuationToken).toBeDefined();

      // Get next page
      const page2 = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: "pagination-test/",
          MaxKeys: 2,
          ContinuationToken: page1.NextContinuationToken,
        }),
      );

      expect(page2.Contents).toHaveLength(2);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Real-world Scenarios
  // ─────────────────────────────────────────────────────────────

  describe("Real-world Scenarios", () => {
    it("should handle ticket attachment upload flow", async () => {
      const orgId = "org-123";
      const ticketId = "ticket-456";
      const attachmentId = "attach-789";

      // Simulate file upload
      const fileContent = Buffer.from("PDF document content...");
      const key = `${orgId}/tickets/${ticketId}/attachments/${attachmentId}.pdf`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: fileContent,
          ContentType: "application/pdf",
          Metadata: {
            "x-amz-meta-original-name": "invoice.pdf",
            "x-amz-meta-uploaded-by": "user-111",
            "x-amz-meta-ticket-id": ticketId,
          },
        }),
      );

      // Generate download URL for customer
      const downloadUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
        { expiresIn: 3600 },
      );

      expect(downloadUrl).toBeDefined();
      // URL contains the key path - slashes may or may not be encoded
      expect(downloadUrl).toContain("org-123");
      expect(downloadUrl).toContain("tickets");
      expect(downloadUrl).toContain("ticket-456");
      expect(downloadUrl).toContain("attachments");
      expect(downloadUrl).toContain("attach-789.pdf");
    });

    it("should handle organization file isolation", async () => {
      // Upload files for two organizations
      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: "org-a/data.txt",
          Body: Buffer.from("Org A data"),
        }),
      );

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: "org-b/data.txt",
          Body: Buffer.from("Org B data"),
        }),
      );

      // List only org-a files
      const orgAFiles = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: "org-a/",
        }),
      );

      expect(orgAFiles.Contents).toHaveLength(1);
      expect(orgAFiles.Contents?.[0].Key).toBe("org-a/data.txt");

      // List only org-b files
      const orgBFiles = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: "org-b/",
        }),
      );

      expect(orgBFiles.Contents).toHaveLength(1);
      expect(orgBFiles.Contents?.[0].Key).toBe("org-b/data.txt");
    });
  });
});

/**
 * Storage Service
 * Multi-backend file storage (local, S3, R2)
 */

import { existsSync, mkdirSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import { config } from "@/config";
import { createLogger } from "@/lib/logger";

const logger = createLogger("storage");

export interface StoredFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  path: string;
}

export interface UploadOptions {
  filename?: string;
  mimeType?: string;
  folder?: string;
}

// ─────────────────────────────────────────────────────────────
// Storage Provider Interface
// ─────────────────────────────────────────────────────────────
interface StorageProvider {
  upload(buffer: Buffer, options: UploadOptions): Promise<StoredFile>;
  download(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  getUrl(path: string): Promise<string>;
  exists(path: string): Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────
// Local Storage Provider
// ─────────────────────────────────────────────────────────────
class LocalStorageProvider implements StorageProvider {
  private basePath: string;

  constructor() {
    this.basePath = config.STORAGE_LOCAL_PATH;
    // Ensure base directory exists
    if (!existsSync(this.basePath)) {
      mkdirSync(this.basePath, { recursive: true });
    }
  }

  async upload(buffer: Buffer, options: UploadOptions): Promise<StoredFile> {
    const id = nanoid();
    const ext = options.filename?.split(".").pop() || "bin";
    const filename = `${id}.${ext}`;
    const folder = options.folder || "general";
    const relativePath = join(folder, filename);
    const fullPath = join(this.basePath, relativePath);

    // Ensure directory exists
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    await writeFile(fullPath, buffer);

    return {
      id,
      filename,
      originalName: options.filename || filename,
      mimeType: options.mimeType || "application/octet-stream",
      size: buffer.length,
      url: `/api/attachments/${relativePath}`,
      path: relativePath,
    };
  }

  async download(path: string): Promise<Buffer> {
    const fullPath = join(this.basePath, path);
    return readFile(fullPath);
  }

  async delete(path: string): Promise<void> {
    const fullPath = join(this.basePath, path);
    if (existsSync(fullPath)) {
      await unlink(fullPath);
    }
  }

  async getUrl(path: string): Promise<string> {
    return `/api/attachments/${path}`;
  }

  async exists(path: string): Promise<boolean> {
    const fullPath = join(this.basePath, path);
    return existsSync(fullPath);
  }

  getFullPath(path: string): string {
    return join(this.basePath, path);
  }
}

// ─────────────────────────────────────────────────────────────
// S3/R2 Storage Provider
// ─────────────────────────────────────────────────────────────
class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    if (!config.STORAGE_S3_BUCKET || !config.STORAGE_S3_ACCESS_KEY || !config.STORAGE_S3_SECRET_KEY) {
      throw new Error("S3 storage requires STORAGE_S3_BUCKET, STORAGE_S3_ACCESS_KEY, and STORAGE_S3_SECRET_KEY");
    }

    this.bucket = config.STORAGE_S3_BUCKET;

    this.client = new S3Client({
      region: config.STORAGE_S3_REGION,
      endpoint: config.STORAGE_S3_ENDPOINT,
      credentials: {
        accessKeyId: config.STORAGE_S3_ACCESS_KEY,
        secretAccessKey: config.STORAGE_S3_SECRET_KEY,
      },
      forcePathStyle: !!config.STORAGE_S3_ENDPOINT, // Required for R2 and MinIO
    });
  }

  async upload(buffer: Buffer, options: UploadOptions): Promise<StoredFile> {
    const id = nanoid();
    const ext = options.filename?.split(".").pop() || "bin";
    const filename = `${id}.${ext}`;
    const folder = options.folder || "general";
    const key = `${folder}/${filename}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: options.mimeType || "application/octet-stream",
      }),
    );

    return {
      id,
      filename,
      originalName: options.filename || filename,
      mimeType: options.mimeType || "application/octet-stream",
      size: buffer.length,
      url: await this.getUrl(key),
      path: key,
    };
  }

  async download(path: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: path,
      }),
    );

    const stream = response.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  async delete(path: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: path,
      }),
    );
  }

  async getUrl(path: string): Promise<string> {
    // Generate a pre-signed URL valid for 1 hour
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: path,
    });

    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: path,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Storage Service Factory
// ─────────────────────────────────────────────────────────────
function createStorageProvider(): StorageProvider {
  switch (config.STORAGE_PROVIDER) {
    case "s3":
    case "r2":
      logger.info({ provider: config.STORAGE_PROVIDER }, "Using S3-compatible storage");
      return new S3StorageProvider();
    default:
      logger.info({ provider: "local", path: config.STORAGE_LOCAL_PATH }, "Using local storage");
      return new LocalStorageProvider();
  }
}

// Singleton storage provider
let storageProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!storageProvider) {
    storageProvider = createStorageProvider();
  }
  return storageProvider;
}

// ─────────────────────────────────────────────────────────────
// File Validation
// ─────────────────────────────────────────────────────────────
export function validateFile(
  file: { size: number; mimetype: string; originalname: string },
): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > config.MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${config.MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  // Check file type
  const allowedTypes = config.ALLOWED_FILE_TYPES.split(",").map((t) => t.trim());
  const isAllowed = allowedTypes.some((type) => {
    if (type.endsWith("/*")) {
      // Wildcard match (e.g., "image/*")
      const category = type.replace("/*", "");
      return file.mimetype.startsWith(category);
    }
    if (type.startsWith(".")) {
      // Extension match
      return file.originalname.toLowerCase().endsWith(type);
    }
    // Exact mimetype match
    return file.mimetype === type;
  });

  if (!isAllowed) {
    return {
      valid: false,
      error: `File type not allowed. Allowed types: ${config.ALLOWED_FILE_TYPES}`,
    };
  }

  return { valid: true };
}

// ─────────────────────────────────────────────────────────────
// Convenience Exports
// ─────────────────────────────────────────────────────────────
export const storage = {
  upload: (buffer: Buffer, options: UploadOptions) => getStorageProvider().upload(buffer, options),
  download: (path: string) => getStorageProvider().download(path),
  delete: (path: string) => getStorageProvider().delete(path),
  getUrl: (path: string) => getStorageProvider().getUrl(path),
  exists: (path: string) => getStorageProvider().exists(path),
  validate: validateFile,
};

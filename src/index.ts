import { createServer } from "node:http";
import { createApp } from "./app";
import { config } from "./config";
import { checkDatabaseConnection, closeDatabaseConnection } from "./db";
import { checkCacheConnection, closeCacheConnection } from "./lib/cache";
import { initializeJobQueue, stopJobQueue } from "./lib/jobs";
import { logger } from "./lib/logger";
import { getIO, initializeSocketIO } from "./lib/socket";

// Log startup environment info (redact sensitive data)
logger.info(
  {
    NODE_ENV: config.NODE_ENV,
    HOST: config.HOST,
    PORT: config.PORT,
    DATABASE_URL: config.DATABASE_URL ? "[SET]" : "[NOT SET]",
    VALKEY_URL: config.VALKEY_URL ? `${config.VALKEY_URL.split("@")[0]}@[REDACTED]` : "[NOT SET]",
  },
  "Starting InsightDesk API with configuration",
);

// Create Express app
const app = createApp();

// Create HTTP server
const httpServer = createServer(app);

// Graceful shutdown handler
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, "Shutting down gracefully...");

  // Close HTTP server (stop accepting new connections)
  httpServer.close(() => {
    logger.info("HTTP server closed");
  });

  // Close Socket.IO
  try {
    const io = getIO();
    io.close(() => {
      logger.info("Socket.IO server closed");
    });
  } catch {
    // Socket.IO not initialized
  }

  // Stop job queue
  await stopJobQueue();
  logger.info("Job queue stopped");

  // Close database connection
  await closeDatabaseConnection();
  logger.info("Database connection closed");

  // Close cache connection
  await closeCacheConnection();
  logger.info("Cache connection closed");

  logger.info("Shutdown complete");
  process.exit(0);
}

// Handle shutdown signals
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Helper: Retry a function with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts: number; delayMs: number; name: string },
): Promise<T> {
  const { maxAttempts, delayMs, name } = options;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        logger.error({ error, attempt }, `${name} failed after ${maxAttempts} attempts`);
        throw error;
      }
      const waitTime = delayMs * attempt;
      logger.warn({ attempt, waitTime }, `${name} failed, retrying in ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
  throw new Error(`${name} failed after ${maxAttempts} attempts`);
}

// Start server
async function start() {
  try {
    // Check database connection with retry (services may not be ready immediately)
    const dbConnected = await withRetry(
      async () => {
        const connected = await checkDatabaseConnection();
        if (!connected) throw new Error("Database ping failed");
        return connected;
      },
      { maxAttempts: 5, delayMs: 2000, name: "Database connection" },
    );
    if (!dbConnected) {
      throw new Error("Failed to connect to database");
    }
    logger.info("Database connected");

    // Check cache connection with retry
    let cacheConnected = false;
    try {
      cacheConnected = await withRetry(
        async () => {
          const connected = await checkCacheConnection();
          if (!connected) throw new Error("Cache ping failed");
          return connected;
        },
        { maxAttempts: 3, delayMs: 1000, name: "Cache connection" },
      );
    } catch {
      logger.warn("Cache not connected - some features may be limited");
    }
    if (cacheConnected) {
      logger.info("Cache connected");
    }

    // Initialize Socket.IO with Redis adapter
    if (cacheConnected) {
      await initializeSocketIO(httpServer);
      logger.info("Socket.IO initialized with Redis adapter");
    }

    // Initialize job queue
    await initializeJobQueue();
    logger.info("Job queue initialized");

    // Start HTTP server
    httpServer.listen(config.PORT, config.HOST, () => {
      logger.info(
        { host: config.HOST, port: config.PORT },
        `🚀 InsightDesk API running at http://${config.HOST}:${config.PORT}`,
      );
    });
  } catch (error) {
    logger.fatal({ error }, "Failed to start server");
    process.exit(1);
  }
}

// Run
start();

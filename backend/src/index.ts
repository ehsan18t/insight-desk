import { createServer } from "http";
import { createApp } from "./app";
import { config } from "./config";
import { checkDatabaseConnection, closeDatabaseConnection } from "./db";
import { checkCacheConnection, closeCacheConnection } from "./lib/cache";
import { initializeJobQueue, stopJobQueue } from "./lib/jobs";
import { logger } from "./lib/logger";
import { getIO, initializeSocketIO } from "./lib/socket";

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

// Start server
async function start() {
  try {
    // Check database connection
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      throw new Error("Failed to connect to database");
    }
    logger.info("Database connected");

    // Check cache connection
    const cacheConnected = await checkCacheConnection();
    if (!cacheConnected) {
      logger.warn("Cache not connected - some features may be limited");
    } else {
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
        `🚀 InsightDesk API running at http://${config.HOST}:${config.PORT}`
      );
    });
  } catch (error) {
    logger.fatal({ error }, "Failed to start server");
    process.exit(1);
  }
}

// Run
start();

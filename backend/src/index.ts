import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createApp } from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { checkDatabaseConnection, closeDatabaseConnection } from './db';
import { valkey, checkCacheConnection, closeCacheConnection } from './lib/cache';

// Create Express app
const app = createApp();

// Create HTTP server
const httpServer = createServer(app);

// Create Socket.IO server
const io = new SocketServer(httpServer, {
  cors: {
    origin: config.FRONTEND_URL,
    credentials: true,
  },
  // Adapter will be set up after Valkey connection is confirmed
});

// Export for use in other modules
export { io };

// Graceful shutdown handler
let isShuttingDown = false;

async function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ signal }, 'Shutting down gracefully...');

  // Close HTTP server (stop accepting new connections)
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  // Close Socket.IO
  io.close(() => {
    logger.info('Socket.IO server closed');
  });

  // Close database connection
  await closeDatabaseConnection();
  logger.info('Database connection closed');

  // Close cache connection
  await closeCacheConnection();
  logger.info('Cache connection closed');

  logger.info('Shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
async function start() {
  try {
    // Check database connection
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }
    logger.info('Database connected');

    // Check cache connection
    const cacheConnected = await checkCacheConnection();
    if (!cacheConnected) {
      logger.warn('Cache not connected - some features may be limited');
    } else {
      // Set up Socket.IO adapter with Valkey
      const pubClient = valkey.duplicate();
      const subClient = valkey.duplicate();
      io.adapter(createAdapter(pubClient, subClient));
      logger.info('Cache connected, Socket.IO adapter configured');
    }

    // Start HTTP server
    httpServer.listen(config.PORT, config.HOST, () => {
      logger.info(
        { host: config.HOST, port: config.PORT },
        `🚀 InsightDesk API running at http://${config.HOST}:${config.PORT}`
      );
    });
  } catch (error) {
    logger.fatal({ error }, 'Failed to start server');
    process.exit(1);
  }
}

// Run
start();

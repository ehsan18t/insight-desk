import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { httpLogger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { rateLimit } from './middleware/rate-limit';

// Import routes (will be added later)
// import { authRouter } from './modules/auth/auth.routes';
// import { ticketsRouter } from './modules/tickets/tickets.routes';
// import { usersRouter } from './modules/users/users.routes';
// import { organizationsRouter } from './modules/organizations/organizations.routes';

export function createApp(): Express {
  const app = express();

  // ─────────────────────────────────────────────────────────────
  // Security middleware
  // ─────────────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // ─────────────────────────────────────────────────────────────
  // CORS configuration
  // ─────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: config.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // ─────────────────────────────────────────────────────────────
  // Body parsing and compression
  // ─────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());
  app.use(compression());

  // ─────────────────────────────────────────────────────────────
  // Request logging
  // ─────────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      httpLogger.info({
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration: `${duration}ms`,
      });
    });
    next();
  });

  // ─────────────────────────────────────────────────────────────
  // Rate limiting
  // ─────────────────────────────────────────────────────────────
  app.use('/api', rateLimit());

  // ─────────────────────────────────────────────────────────────
  // Health check
  // ─────────────────────────────────────────────────────────────
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
    });
  });

  // ─────────────────────────────────────────────────────────────
  // API Routes (will be added as modules are built)
  // ─────────────────────────────────────────────────────────────
  // app.use('/api/auth', authRouter);
  // app.use('/api/tickets', ticketsRouter);
  // app.use('/api/users', usersRouter);
  // app.use('/api/organizations', organizationsRouter);

  // Placeholder route for testing
  app.get('/api', (req, res) => {
    res.json({
      success: true,
      message: 'InsightDesk API v0.1.0',
      endpoints: {
        auth: '/api/auth',
        tickets: '/api/tickets',
        users: '/api/users',
        organizations: '/api/organizations',
      },
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Error handling
  // ─────────────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

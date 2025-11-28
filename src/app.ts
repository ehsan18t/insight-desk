import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { config } from "./config";
import { httpLogger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { rateLimit } from "./middleware/rate-limit";

// Import routes
import { attachmentsRouter } from "./modules/attachments";
import { authRouter } from "./modules/auth";
import { cannedResponsesRouter } from "./modules/canned-responses";
import { categoriesRouter } from "./modules/categories";
import { dashboardRouter } from "./modules/dashboard";
import { organizationsRouter } from "./modules/organizations";
import { slaRouter } from "./modules/sla";
import { tagsRouter } from "./modules/tags";
import { ticketsRouter } from "./modules/tickets";
import { usersRouter } from "./modules/users";

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
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // ─────────────────────────────────────────────────────────────
  // CORS configuration
  // ─────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: config.FRONTEND_URL,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  // ─────────────────────────────────────────────────────────────
  // Body parsing and compression
  // ─────────────────────────────────────────────────────────────
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.use(cookieParser());
  app.use(compression());

  // ─────────────────────────────────────────────────────────────
  // Request logging
  // ─────────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
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
  app.use("/api", rateLimit());

  // ─────────────────────────────────────────────────────────────
  // Health check
  // ─────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "0.1.0",
    });
  });

  // ─────────────────────────────────────────────────────────────
  // API Routes
  // ─────────────────────────────────────────────────────────────
  app.use("/api/auth", authRouter);
  app.use("/api/tickets", ticketsRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/organizations", organizationsRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/tags", tagsRouter);
  app.use("/api/attachments", attachmentsRouter);
  app.use("/api/sla-policies", slaRouter);
  app.use("/api/canned-responses", cannedResponsesRouter);
  app.use("/api/dashboard", dashboardRouter);

  // Placeholder route for testing
  app.get("/api", (_req, res) => {
    res.json({
      success: true,
      message: "InsightDesk API v0.1.0",
      endpoints: {
        auth: "/api/auth",
        tickets: "/api/tickets",
        users: "/api/users",
        organizations: "/api/organizations",
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

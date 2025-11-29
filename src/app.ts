import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { config, isApiDocsEnabled } from "./config";
import { generateOpenAPIDocument } from "./lib/openapi";
import { httpLogger } from "./lib/logger";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { rateLimit } from "./middleware/rate-limit";

// Import routes (these also register their OpenAPI definitions)
import { attachmentsRouter } from "./modules/attachments";
import { auditRouter } from "./modules/audit";
import { authRouter } from "./modules/auth";
import { cannedResponsesRouter } from "./modules/canned-responses";
import { categoriesRouter } from "./modules/categories";
import { csatRoutes } from "./modules/csat";
import { dashboardRouter } from "./modules/dashboard";
import { exportRouter } from "./modules/export";
import { jobsRouter } from "./modules/jobs";
import "./modules/messages"; // Messages OpenAPI registration (nested under tickets)
import { organizationsRouter } from "./modules/organizations";
import { plansRouter } from "./modules/plans";
import { savedFiltersRouter } from "./modules/saved-filters";
import { slaRouter } from "./modules/sla";
import { subscriptionsRouter } from "./modules/subscriptions";
import { tagsRouter } from "./modules/tags";
import { ticketsRouter } from "./modules/tickets";
import { usersRouter } from "./modules/users";

export function createApp(): Express {
  const app = express();

  // ─────────────────────────────────────────────────────────────
  // Trust proxy (for proper IP extraction behind reverse proxies)
  // ─────────────────────────────────────────────────────────────
  app.set("trust proxy", 1);

  // ─────────────────────────────────────────────────────────────
  // Security middleware
  // ─────────────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
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
  // API Documentation (Swagger UI) - Conditionally enabled
  // ─────────────────────────────────────────────────────────────
  if (isApiDocsEnabled) {
    const openapiSpec = generateOpenAPIDocument();

    // Serve raw OpenAPI JSON spec
    app.get("/api/docs/openapi.json", (_req, res) => {
      res.json(openapiSpec);
    });

    // Swagger UI
    app.use(
      config.API_DOCS_PATH,
      swaggerUi.serve,
      swaggerUi.setup(openapiSpec, {
        customCss: ".swagger-ui .topbar { display: none }",
        customSiteTitle: "InsightDesk API Documentation",
      }),
    );
  }

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
  app.use("/api/saved-filters", savedFiltersRouter);
  app.use("/api/sla-policies", slaRouter);
  app.use("/api/canned-responses", cannedResponsesRouter);
  app.use("/api/csat", csatRoutes);
  app.use("/api/export", exportRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/jobs", jobsRouter);
  app.use("/api/plans", plansRouter);
  app.use("/api/subscriptions", subscriptionsRouter);
  app.use("/api/audit", auditRouter);

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

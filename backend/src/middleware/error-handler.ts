import type { NextFunction, Request, Response } from "express";
import { createLogger } from "../lib/logger";

const logger = createLogger("error");

// Custom error classes
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;

  constructor(message: string, statusCode = 500, code?: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request") {
    super(message, 400, "BAD_REQUEST");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists") {
    super(message, 409, "CONFLICT");
  }
}

// Error response format
interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: unknown;
  stack?: string;
}

// Global error handler middleware
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  // Log error
  if (err instanceof AppError && err.isOperational) {
    logger.warn({ err, path: req.path, method: req.method }, "Operational error");
  } else {
    logger.error({ err, path: req.path, method: req.method }, "Unexpected error");
  }

  // Determine status code
  const statusCode = err instanceof AppError ? err.statusCode : 500;

  // Build response
  const response: ErrorResponse = {
    success: false,
    error: err.message || "Internal server error",
    code: err instanceof AppError ? err.code : "INTERNAL_ERROR",
  };

  // Include stack trace in development
  if (process.env.NODE_ENV === "development") {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

// 404 handler for unknown routes
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
    code: "ROUTE_NOT_FOUND",
  });
}

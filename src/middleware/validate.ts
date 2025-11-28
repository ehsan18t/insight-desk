import type { NextFunction, Request, Response } from "express-serve-static-core";
import { z } from "zod";

// Validation error response type
interface ValidationError {
  field: string;
  message: string;
}

// Helper to clear and assign object properties
function replaceObjectContent(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, source);
}

// Validate request body, query, or params
export function validate(schema: z.ZodType, source: "body" | "query" | "params" = "body") {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = schema.parse(req[source]);
      // Replace with parsed (and transformed) data
      // Use Object.assign to avoid readonly property error for query/params
      if (source === "body") {
        req.body = data;
      } else {
        replaceObjectContent(
          req[source] as Record<string, unknown>,
          data as Record<string, unknown>,
        );
      }
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: ValidationError[] = error.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));

        res.status(400).json({
          success: false,
          error: "Validation failed",
          details: errors,
        });
        return;
      }
      next(error);
    }
  };
}

// Validate multiple sources at once
export function validateRequest(schemas: {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        const data = schemas.query.parse(req.query);
        replaceObjectContent(req.query as Record<string, unknown>, data as Record<string, unknown>);
      }
      if (schemas.params) {
        const data = schemas.params.parse(req.params);
        replaceObjectContent(
          req.params as Record<string, unknown>,
          data as Record<string, unknown>,
        );
      }
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: ValidationError[] = error.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));

        res.status(400).json({
          success: false,
          error: "Validation failed",
          details: errors,
        });
        return;
      }
      next(error);
    }
  };
}

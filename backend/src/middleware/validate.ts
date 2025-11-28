import type { Request, Response, NextFunction, ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import { ZodError, type ZodSchema, type ZodIssue } from 'zod';

// Validation error response type
interface ValidationError {
  field: string;
  message: string;
}

// Validate request body, query, or params
export function validate(schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = schema.parse(req[source]);
      req[source] = data; // Replace with parsed (and transformed) data
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors: ValidationError[] = error.issues.map((e: ZodIssue) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        res.status(400).json({
          success: false,
          error: 'Validation failed',
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
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as ParsedQs;
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as ParamsDictionary;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors: ValidationError[] = error.issues.map((e: ZodIssue) => ({
          field: e.path.join('.'),
          message: e.message,
        }));

        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors,
        });
        return;
      }
      next(error);
    }
  };
}

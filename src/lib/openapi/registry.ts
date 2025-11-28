/**
 * OpenAPI Registry
 *
 * Central registry for all OpenAPI definitions.
 * This file should have minimal dependencies to avoid circular imports.
 */

import { OpenAPIRegistry, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Extend Zod with OpenAPI support - must be done before any schema definitions
extendZodWithOpenApi(z);

// Create the global registry for all API definitions
export const registry = new OpenAPIRegistry();

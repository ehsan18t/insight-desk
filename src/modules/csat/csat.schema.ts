import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Submit Survey Response
// ─────────────────────────────────────────────────────────────

export const submitSurveySchema = z.object({
  rating: z.int().min(1).max(5, "Rating must be between 1 and 5"),
  feedback: z.string().max(2000, "Feedback must be 2000 characters or less").optional(),
});

export type SubmitSurveyInput = z.infer<typeof submitSurveySchema>;

// ─────────────────────────────────────────────────────────────
// Survey Query Schema
// ─────────────────────────────────────────────────────────────

export const surveyQuerySchema = z.object({
  page: z.coerce.number().int().positive().prefault(1),
  limit: z.coerce.number().int().positive().max(100).prefault(20),
  agentId: z.uuid().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  dateFrom: z.iso.datetime().optional(),
  dateTo: z.iso.datetime().optional(),
  responded: z
    .string()
    .transform((v) => v === "true")
    .optional(),
});

export type SurveyQuery = z.infer<typeof surveyQuerySchema>;

// ─────────────────────────────────────────────────────────────
// Survey Token Param
// ─────────────────────────────────────────────────────────────

export const surveyTokenParamSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

// ─────────────────────────────────────────────────────────────
// Survey ID Param
// ─────────────────────────────────────────────────────────────

export const surveyIdParamSchema = z.object({
  id: z.uuid("Invalid survey ID"),
});

// ─────────────────────────────────────────────────────────────
// Stats Query
// ─────────────────────────────────────────────────────────────

export const statsQuerySchema = z.object({
  agentId: z.uuid().optional(),
  dateFrom: z.iso.datetime().optional(),
  dateTo: z.iso.datetime().optional(),
});

export type StatsQuery = z.infer<typeof statsQuerySchema>;

import { z } from "zod";

const riskLevelSchema = z.enum(["critical", "high", "medium", "low"]);

export const reviewReportSchema = z.object({
  summary: z.string(),
  changeType: z.string(),
  riskLevel: riskLevelSchema,
  keyChanges: z.array(z.string()),
  riskFindings: z.array(
    z.object({
      title: z.string(),
      severity: riskLevelSchema,
      confidence: z.number().min(0).max(1),
      file: z.string(),
      line: z.number().nullable().optional(),
      evidence: z.string(),
      impact: z.string(),
      recommendation: z.string()
    })
  ),
  reviewSuggestions: z.array(z.string()),
  testSuggestions: z.array(z.string()),
  inlineSuggestions: z.array(
    z.object({
      file: z.string(),
      line: z.number(),
      severity: riskLevelSchema,
      confidence: z.number().min(0).max(1),
      body: z.string()
    })
  )
});

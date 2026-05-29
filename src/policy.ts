import { parse } from "yaml";
import type { ReviewPolicy } from "./types.js";

export const DEFAULT_REVIEW_POLICY: ReviewPolicy = {
  ignorePaths: [],
  reviewInstructions: []
};

export function parseReviewPolicy(content: string): ReviewPolicy {
  const raw = parse(content) ?? {};

  return {
    ignorePaths: stringArray(raw.ignorePaths),
    maxInlineComments: optionalPositiveInteger(raw.maxInlineComments),
    minInlineConfidence: optionalBoundedNumber(raw.minInlineConfidence, 0, 1),
    maxDiffChars: optionalPositiveInteger(raw.maxDiffChars),
    reviewInstructions: stringArray(raw.reviewInstructions)
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function optionalPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }

  return value;
}

function optionalBoundedNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || value < min || value > max) {
    return undefined;
  }

  return value;
}

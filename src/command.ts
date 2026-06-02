import { loadConfig } from "./config.js";
import type { FixCommandOptions, ReviewOptions, ReviewPolicy } from "./types.js";

export interface ReviewCommand {
  shouldRun: boolean;
  overrides: Partial<Pick<ReviewOptions, "mode" | "maxInlineComments" | "minInlineConfidence" | "maxDiffChars">>;
}

export interface FixCommand {
  shouldRun: boolean;
  options: FixCommandOptions;
}

export function parseReviewCommand(body: string): ReviewCommand {
  const commandLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line === "/ai-review" || line.startsWith("/ai-review "));

  if (!commandLine) {
    return { shouldRun: false, overrides: {} };
  }

  const args = commandLine.split(/\s+/).slice(1);
  const overrides: ReviewCommand["overrides"] = {};

  for (const arg of args) {
    if (arg === "--report-only") {
      overrides.mode = "report";
      continue;
    }

    if (arg === "--inline-only") {
      overrides.mode = "inline";
      continue;
    }

    if (arg === "--all") {
      overrides.mode = "all";
      continue;
    }

    const [key, value] = arg.split("=", 2);
    if (!value) {
      continue;
    }

    if (key === "--max-inline") {
      overrides.maxInlineComments = positiveInteger(value);
      continue;
    }

    if (key === "--min-confidence") {
      overrides.minInlineConfidence = boundedNumber(value, 0, 1);
      continue;
    }

    if (key === "--max-diff") {
      overrides.maxDiffChars = positiveInteger(value);
    }
  }

  return { shouldRun: true, overrides: removeUndefined(overrides) };
}

export function parseFixCommand(body: string): FixCommand {
  const commandLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line === "/ai-fix" || line.startsWith("/ai-fix "));

  if (!commandLine) {
    return { shouldRun: false, options: { dryRun: false, maxFiles: 3 } };
  }

  const args = commandLine.split(/\s+/).slice(1);
  const options: FixCommandOptions = { dryRun: false, maxFiles: 3 };

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    const [key, value] = arg.split("=", 2);
    if (key === "--max-files" && value) {
      options.maxFiles = positiveInteger(value) ?? options.maxFiles;
    }
  }

  return { shouldRun: true, options };
}

export function buildReviewOptions(policy: ReviewPolicy, overrides: ReviewCommand["overrides"]): ReviewOptions {
  const config = loadConfig();
  return {
    mode: overrides.mode ?? "all",
    maxInlineComments: overrides.maxInlineComments ?? policy.maxInlineComments ?? config.maxInlineComments,
    minInlineConfidence: overrides.minInlineConfidence ?? policy.minInlineConfidence ?? config.minInlineConfidence,
    maxDiffChars: overrides.maxDiffChars ?? policy.maxDiffChars ?? config.maxDiffChars,
    policy
  };
}

function positiveInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function boundedNumber(value: string, min: number, max: number): number | undefined {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function removeUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

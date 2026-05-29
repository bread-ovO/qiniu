import { describe, expect, it } from "vitest";
import { parseReviewPolicy } from "../src/policy.js";

describe("parseReviewPolicy", () => {
  it("parses supported team policy fields", () => {
    const policy = parseReviewPolicy(`
ignorePaths:
  - docs/**
maxInlineComments: 3
minInlineConfidence: 0.82
maxDiffChars: 50000
reviewInstructions:
  - Prioritize auth and billing risk.
`);

    expect(policy).toEqual({
      ignorePaths: ["docs/**"],
      maxInlineComments: 3,
      minInlineConfidence: 0.82,
      maxDiffChars: 50000,
      reviewInstructions: ["Prioritize auth and billing risk."]
    });
  });
});

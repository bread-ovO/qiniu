import { describe, expect, it } from "vitest";
import { parseFixCommand, parseReviewCommand } from "../src/command.js";
import { isReviewCommand } from "../src/index.js";

describe("isReviewCommand", () => {
  it("matches an exact command line", () => {
    expect(isReviewCommand("please run\n/ai-review")).toBe(true);
  });

  it("matches a command with flags", () => {
    const command = parseReviewCommand("/ai-review --report-only --max-inline=2 --min-confidence=0.9");

    expect(command).toEqual({
      shouldRun: true,
      overrides: {
        mode: "report",
        maxInlineComments: 2,
        minInlineConfidence: 0.9
      }
    });
  });

  it("ignores unrelated slash commands", () => {
    expect(isReviewCommand("/ai-reviewer")).toBe(false);
  });
});

describe("parseFixCommand", () => {
  it("matches dry-run fix commands", () => {
    expect(parseFixCommand("/ai-fix --dry-run --max-files=2")).toEqual({
      shouldRun: true,
      options: {
        dryRun: true,
        maxFiles: 2
      }
    });
  });

  it("ignores unrelated fix-like commands", () => {
    expect(parseFixCommand("/ai-fixer").shouldRun).toBe(false);
  });
});

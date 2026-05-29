import { describe, expect, it } from "vitest";
import { isReviewCommand } from "../src/index.js";

describe("isReviewCommand", () => {
  it("matches an exact command line", () => {
    expect(isReviewCommand("please run\n/ai-review")).toBe(true);
  });

  it("ignores partial command text", () => {
    expect(isReviewCommand("/ai-review now")).toBe(false);
  });
});

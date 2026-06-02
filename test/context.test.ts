import { describe, expect, it } from "vitest";
import { formatRelatedContextForModel, inferRelatedContextPaths } from "../src/context.js";

describe("inferRelatedContextPaths", () => {
  it("finds source and test counterparts for changed TypeScript files", () => {
    expect(inferRelatedContextPaths(["src/analyzer.ts", "test/fixer.test.ts"])).toEqual([
      "test/analyzer.test.ts",
      "test/analyzer.spec.ts",
      "src/fixer.ts"
    ]);
  });

  it("deduplicates candidates and excludes changed files", () => {
    expect(inferRelatedContextPaths(["src/user.ts", "test/user.test.ts", "src/user.ts"])).toEqual([
      "test/user.spec.ts"
    ]);
  });

  it("supports spec files and nested source paths", () => {
    expect(inferRelatedContextPaths(["src/lib/retry.ts", "test/lib/policy.spec.ts"])).toEqual([
      "test/lib/retry.test.ts",
      "test/lib/retry.spec.ts",
      "src/lib/policy.ts"
    ]);
  });
});

describe("formatRelatedContextForModel", () => {
  it("renders related files with a character budget", () => {
    expect(
      formatRelatedContextForModel(
        [
          { path: "src/a.ts", content: "export const a = 1;" },
          { path: "test/a.test.ts", content: "expect(a).toBe(1);" }
        ],
        80
      )
    ).toBe("--- src/a.ts\nexport const a = 1;\n\n--- test/a.test.ts\nexpect(a).toBe(1);");
  });

  it("returns an empty string when no related context is available", () => {
    expect(formatRelatedContextForModel([], 100)).toBe("");
  });
});

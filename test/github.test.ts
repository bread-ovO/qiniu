import { describe, expect, it } from "vitest";
import { createVerificationCheck, dispatchVerificationWorkflow, getRelatedContextSnapshots, getRepositoryFileSnapshots } from "../src/github.js";

describe("getRelatedContextSnapshots", () => {
  it("fetches inferred counterpart files and ignores missing candidates", async () => {
    const requestedPaths: string[] = [];
    const octokit = {
      rest: {
        repos: {
          getContent: async ({ path }: { path: string }) => {
            requestedPaths.push(path);
            if (path === "test/analyzer.test.ts") {
              return {
                data: {
                  type: "file",
                  content: Buffer.from("describe('analyzer', () => {})").toString("base64")
                }
              };
            }
            const error = new Error("not found") as Error & { status: number };
            error.status = 404;
            throw error;
          }
        }
      }
    };

    await expect(
      getRelatedContextSnapshots(octokit, { owner: "bread-ovO", repo: "qiniu" }, "head-sha", ["src/analyzer.ts"])
    ).resolves.toEqual([{ path: "test/analyzer.test.ts", content: "describe('analyzer', () => {})" }]);

    expect(requestedPaths).toEqual(["test/analyzer.test.ts", "test/analyzer.spec.ts"]);
  });
});

describe("getRepositoryFileSnapshots", () => {
  it("fetches existing repository files and skips missing files", async () => {
    const octokit = {
      rest: {
        repos: {
          getContent: async ({ path }: { path: string }) => {
            if (path === "package.json") {
              return { data: { type: "file", content: Buffer.from("{\"scripts\":{}}", "utf8").toString("base64") } };
            }
            const error = new Error("not found") as Error & { status: number };
            error.status = 404;
            throw error;
          }
        }
      }
    };

    await expect(
      getRepositoryFileSnapshots(octokit, { owner: "bread-ovO", repo: "qiniu" }, "head-sha", ["package.json", "pnpm-lock.yaml"])
    ).resolves.toEqual([{ path: "package.json", content: "{\"scripts\":{}}" }]);
  });
});

describe("createVerificationCheck", () => {
  it("creates a neutral GitHub Check Run with verification commands", async () => {
    const calls: unknown[] = [];
    const octokit = {
      rest: {
        checks: {
          create: async (input: unknown) => {
            calls.push(input);
            return { data: { html_url: "https://github.com/bread-ovO/qiniu/runs/1" } };
          }
        }
      }
    };

    await expect(
      createVerificationCheck(octokit, { owner: "bread-ovO", repo: "qiniu" }, "commit-sha", ["npm test", "npm run build"])
    ).resolves.toBe("https://github.com/bread-ovO/qiniu/runs/1");

    expect(calls).toEqual([
      {
        owner: "bread-ovO",
        repo: "qiniu",
        name: "AI Fix Verification Plan",
        head_sha: "commit-sha",
        status: "completed",
        conclusion: "neutral",
        output: {
          title: "AI 修复验证计划",
          summary: "Bot 已生成修复提交。请在 CI 或本地执行以下验证命令：\n\n- `npm test`\n- `npm run build`"
        }
      }
    ]);
  });

  it("does not fail the fix flow when checks permission is unavailable", async () => {
    const octokit = {
      rest: {
        checks: {
          create: async () => {
            const error = new Error("Resource not accessible by integration") as Error & { status: number };
            error.status = 403;
            throw error;
          }
        }
      }
    };

    await expect(
      createVerificationCheck(octokit, { owner: "bread-ovO", repo: "qiniu" }, "commit-sha", ["npm test"])
    ).resolves.toBeUndefined();
  });
});

describe("dispatchVerificationWorkflow", () => {
  it("dispatches the AI fix verification workflow with commit and commands", async () => {
    const calls: unknown[] = [];
    const octokit = {
      rest: {
        actions: {
          createWorkflowDispatch: async (input: unknown) => {
            calls.push(input);
          }
        }
      }
    };

    await expect(
      dispatchVerificationWorkflow(octokit, { owner: "bread-ovO", repo: "qiniu" }, "feature-branch", "commit-sha", [
        "npm test",
        "npm run build"
      ])
    ).resolves.toBe(true);

    expect(calls).toEqual([
      {
        owner: "bread-ovO",
        repo: "qiniu",
        workflow_id: "ai-fix-verify.yml",
        ref: "feature-branch",
        inputs: {
          commit_sha: "commit-sha",
          commands: "npm test\nnpm run build"
        }
      }
    ]);
  });

  it("does not fail the fix flow when workflow dispatch is unavailable", async () => {
    const octokit = {
      rest: {
        actions: {
          createWorkflowDispatch: async () => {
            const error = new Error("workflow missing") as Error & { status: number };
            error.status = 404;
            throw error;
          }
        }
      }
    };

    await expect(
      dispatchVerificationWorkflow(octokit, { owner: "bread-ovO", repo: "qiniu" }, "feature-branch", "commit-sha", ["npm test"])
    ).resolves.toBe(false);
  });
});

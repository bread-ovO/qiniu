import { describe, expect, it } from "vitest";
import {
  collectWorkflowRunFailedJobs,
  getWorkflowRunPullNumber,
  isAiFixVerificationWorkflowRun,
  renderWorkflowVerificationComment
} from "../src/workflow-feedback.js";

describe("workflow verification feedback", () => {
  it("handles only completed AI fix verification workflow runs", () => {
    expect(
      isAiFixVerificationWorkflowRun({
        workflow_run: {
          name: "AI Fix Verify",
          status: "completed"
        }
      })
    ).toBe(true);

    expect(
      isAiFixVerificationWorkflowRun({
        workflow_run: {
          name: "CI",
          status: "completed"
        }
      })
    ).toBe(false);

    expect(
      isAiFixVerificationWorkflowRun({
        workflow_run: {
          name: "AI Fix Verify",
          status: "in_progress"
        }
      })
    ).toBe(false);
  });

  it("extracts the associated pull request number from workflow_run payload", () => {
    expect(
      getWorkflowRunPullNumber({
        pull_requests: [{ number: 42 }]
      })
    ).toBe(42);

    expect(getWorkflowRunPullNumber({ pull_requests: [] })).toBeUndefined();
  });

  it("collects failed jobs and failed steps from a workflow run", async () => {
    const octokit = {
      paginate: async () => [
        {
          id: 2,
          name: "verify",
          conclusion: "failure",
          html_url: "https://github.com/bread-ovO/qiniu/actions/runs/1/job/2",
          steps: [
            { name: "Install dependencies", conclusion: "success" },
            { name: "Run verification commands", conclusion: "failure" }
          ]
        },
        {
          name: "cleanup",
          conclusion: "success",
          html_url: "https://github.com/bread-ovO/qiniu/actions/runs/1/job/3",
          steps: []
        }
      ],
      rest: {
        actions: {
          listJobsForWorkflowRun: "listJobsForWorkflowRun",
          downloadJobLogsForWorkflowRun: async ({ job_id }: { job_id: number }) => ({
            data: job_id === 2 ? "npm test\nFAIL src/example.test.ts\nexpected true to be false" : ""
          })
        }
      }
    };

    await expect(collectWorkflowRunFailedJobs(octokit, { owner: "bread-ovO", repo: "qiniu" }, 1)).resolves.toEqual([
      {
        name: "verify",
        conclusion: "failure",
        htmlUrl: "https://github.com/bread-ovO/qiniu/actions/runs/1/job/2",
        failedSteps: ["Run verification commands"],
        logExcerpt: "npm test\nFAIL src/example.test.ts\nexpected true to be false"
      }
    ]);
  });

  it("renders success and failure PR comments for verification runs", () => {
    expect(
      renderWorkflowVerificationComment({
        conclusion: "success",
        runUrl: "https://github.com/bread-ovO/qiniu/actions/runs/1",
        headSha: "abcdef123456"
      })
    ).toContain("自动修复验证通过");

    const failure = renderWorkflowVerificationComment({
      conclusion: "failure",
      runUrl: "https://github.com/bread-ovO/qiniu/actions/runs/1",
      headSha: "abcdef123456",
      failedJobs: [
        {
          name: "verify",
          conclusion: "failure",
          htmlUrl: "https://github.com/bread-ovO/qiniu/actions/runs/1/job/2",
          failedSteps: ["Run verification commands"],
          logExcerpt: "npm test\nFAIL src/example.test.ts"
        }
      ]
    });

    expect(failure).toContain("自动修复验证失败");
    expect(failure).toContain("verify");
    expect(failure).toContain("Run verification commands");
    expect(failure).toContain("FAIL src/example.test.ts");
  });
});

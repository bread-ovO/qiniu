type Octokit = any;

interface RepoRef {
  owner: string;
  repo: string;
}

export interface FailedWorkflowJob {
  name: string;
  conclusion: string;
  htmlUrl?: string;
  failedSteps: string[];
  logExcerpt?: string;
}

interface WorkflowVerificationCommentInput {
  conclusion?: string | null;
  runUrl?: string;
  headSha?: string;
  failedJobs?: FailedWorkflowJob[];
}

const AI_FIX_VERIFY_WORKFLOW_NAME = "AI Fix Verify";
const FAILED_JOB_CONCLUSIONS = new Set(["failure", "timed_out", "cancelled", "action_required"]);
const FAILED_STEP_CONCLUSIONS = new Set(["failure", "timed_out", "cancelled", "action_required"]);

export function isAiFixVerificationWorkflowRun(payload: any): boolean {
  const workflowRun = payload?.workflow_run;
  return workflowRun?.name === AI_FIX_VERIFY_WORKFLOW_NAME && workflowRun?.status === "completed";
}

export function getWorkflowRunPullNumber(workflowRun: any): number | undefined {
  const pullRequest = workflowRun?.pull_requests?.[0];
  return typeof pullRequest?.number === "number" ? pullRequest.number : undefined;
}

export async function collectWorkflowRunFailedJobs(
  octokit: Octokit,
  repoRef: RepoRef,
  runId: number
): Promise<FailedWorkflowJob[]> {
  const jobs = await octokit.paginate(octokit.rest.actions.listJobsForWorkflowRun, {
    ...repoRef,
    run_id: runId,
    per_page: 100
  });

  const failedJobs = jobs
    .filter((job: any) => FAILED_JOB_CONCLUSIONS.has(job.conclusion))
    .map((job: any) => ({
      id: job.id,
      name: job.name,
      conclusion: job.conclusion,
      htmlUrl: job.html_url,
      failedSteps: (job.steps ?? [])
        .filter((step: any) => FAILED_STEP_CONCLUSIONS.has(step.conclusion))
        .map((step: any) => step.name)
    }));

  return Promise.all(
    failedJobs.map(async (job: any) => {
      const logExcerpt = typeof job.id === "number" ? await downloadJobLogExcerpt(octokit, repoRef, job.id) : undefined;
      return {
        name: job.name,
        conclusion: job.conclusion,
        htmlUrl: job.htmlUrl,
        failedSteps: job.failedSteps,
        ...(logExcerpt ? { logExcerpt } : {})
      };
    })
  );
}

async function downloadJobLogExcerpt(octokit: Octokit, repoRef: RepoRef, jobId: number): Promise<string | undefined> {
  if (!octokit.rest.actions.downloadJobLogsForWorkflowRun) {
    return undefined;
  }

  try {
    const response = await octokit.rest.actions.downloadJobLogsForWorkflowRun({
      ...repoRef,
      job_id: jobId
    });
    return normalizeLogExcerpt(response.data);
  } catch (error: any) {
    if (error.status === 403 || error.status === 404) {
      return undefined;
    }

    throw error;
  }
}

function normalizeLogExcerpt(data: unknown): string | undefined {
  const text = typeof data === "string"
    ? data
    : data instanceof ArrayBuffer
      ? Buffer.from(data).toString("utf8")
      : Buffer.isBuffer(data)
        ? data.toString("utf8")
        : undefined;

  if (!text?.trim()) {
    return undefined;
  }

  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(-30)
    .join("\n")
    .slice(-4000);
}

export function renderWorkflowVerificationComment(input: WorkflowVerificationCommentInput): string {
  const shortSha = input.headSha ? input.headSha.slice(0, 12) : "unknown";
  const runLine = input.runUrl ? `- Actions Run：${input.runUrl}` : undefined;
  const headLine = `- 修复 Commit：\`${shortSha}\``;

  if (input.conclusion === "success") {
    return [
      "## ✅ AI 自动修复验证通过",
      "",
      "GitHub Actions 已完成对自动修复 commit 的验证。",
      "",
      headLine,
      runLine
    ]
      .filter(Boolean)
      .join("\n");
  }

  const failedJobs = input.failedJobs ?? [];
  const failedJobLines = failedJobs.length > 0
    ? failedJobs.flatMap((job) => {
        const lines = [
          `- ${job.name}：${job.conclusion}${job.htmlUrl ? ` (${job.htmlUrl})` : ""}`,
          ...job.failedSteps.map((step) => `  - 失败步骤：${step}`)
        ];
        if (job.logExcerpt) {
          lines.push("", "```text", job.logExcerpt, "```");
        }
        return lines;
      })
    : ["- 未能读取失败 Job 详情，请打开 Actions Run 查看日志。"];

  return [
    "## ❌ AI 自动修复验证失败",
    "",
    "GitHub Actions 对自动修复 commit 的验证没有通过。建议根据下面的失败 Job/步骤继续定位，必要时重新运行 `/ai-fix`。",
    "",
    headLine,
    runLine,
    "",
    "### 失败摘要",
    ...failedJobLines
  ]
    .filter(Boolean)
    .join("\n");
}

import "dotenv/config";
import type { Probot } from "probot";
import { PullRequestAnalyzer } from "./analyzer.js";
import { buildReviewOptions, parseFixCommand, parseReviewCommand } from "./command.js";
import { validateStartupEnv } from "./env.js";
import { PullRequestFixer } from "./fixer.js";
import { renderFixResult } from "./fix-render.js";
import {
  addEyesReaction,
  commitFixPlan,
  createIssueComment,
  createVerificationCheck,
  dispatchVerificationWorkflow,
  ensureReportComment,
  getChangedFileSnapshots,
  getRelatedContextSnapshots,
  getRepositoryFileSnapshots,
  getReviewPolicy,
  getPullRequestContext,
  publishInlineReview,
  updateReportComment
} from "./github.js";
import { renderFailureComment, renderReport } from "./render.js";
import {
  collectWorkflowRunFailedJobs,
  getWorkflowRunPullNumber,
  isAiFixVerificationWorkflowRun,
  renderWorkflowVerificationComment
} from "./workflow-feedback.js";

export default function app(app: Probot) {
  validateStartupEnv();

  app.on("workflow_run.completed", async (context) => {
    const payload = context.payload as any;
    if (!isAiFixVerificationWorkflowRun(payload)) {
      return;
    }

    const workflowRun = payload.workflow_run;
    const pullNumber = getWorkflowRunPullNumber(workflowRun);
    if (!pullNumber) {
      context.log.info({ runId: workflowRun.id }, "AI fix verification run has no associated pull request");
      return;
    }

    const repoRef = context.repo();
    try {
      const failedJobs = workflowRun.conclusion === "success"
        ? []
        : await collectWorkflowRunFailedJobs(context.octokit, repoRef, workflowRun.id);

      await createIssueComment(
        context.octokit,
        repoRef,
        pullNumber,
        renderWorkflowVerificationComment({
          conclusion: workflowRun.conclusion,
          runUrl: workflowRun.html_url,
          headSha: workflowRun.head_sha,
          failedJobs
        })
      );
    } catch (error) {
      context.log.error(error, "AI fix verification feedback failed");
    }
  });

  app.on("issue_comment.created", async (context) => {
    const payload = context.payload;
    const commentBody = payload.comment.body ?? "";
    const reviewCommand = parseReviewCommand(commentBody);
    const fixCommand = parseFixCommand(commentBody);

    if (!payload.issue.pull_request || (!reviewCommand.shouldRun && !fixCommand.shouldRun)) {
      return;
    }

    const repoRef = context.repo();
    const pullNumber = payload.issue.number;
    const triggerCommentId = payload.comment.id;
    const reportCommentId = await ensureReportComment(context.octokit, repoRef, pullNumber);

    await addEyesReaction(context.octokit, repoRef, triggerCommentId);

    try {
      const basePrContext = await getPullRequestContext(context.octokit, repoRef, pullNumber);
      const policy = await getReviewPolicy(context.octokit, repoRef, basePrContext.headSha);
      const relatedContext = await getRelatedContextSnapshots(
        context.octokit,
        repoRef,
        basePrContext.headSha,
        basePrContext.files.map((file) => file.filename)
      );
      const prContext = { ...basePrContext, relatedContext };
      const options = buildReviewOptions(policy, reviewCommand.overrides);
      const result = await new PullRequestAnalyzer().analyze(prContext, options);

      await updateReportComment(context.octokit, repoRef, reportCommentId, renderReport(result));

      if (reviewCommand.shouldRun) {
        await publishInlineReview(context.octokit, repoRef, pullNumber, prContext.headSha, result);
      }

      if (fixCommand.shouldRun) {
        const snapshots = await getChangedFileSnapshots(
          context.octokit,
          repoRef,
          prContext.headSha,
          prContext.files.map((file) => file.filename)
        );
        const verificationSnapshots = await getRepositoryFileSnapshots(context.octokit, repoRef, prContext.headSha, ["package.json"]);
        const plan = await new PullRequestFixer().createFixPlan(
          prContext,
          result.report,
          snapshots,
          fixCommand.options,
          verificationSnapshots
        );
        const sameRepository = prContext.headRepoOwner === repoRef.owner && prContext.headRepoName === repoRef.repo;
        const shouldCommit = !fixCommand.options.dryRun && sameRepository && plan.files.length > 0;
        const commitSha = shouldCommit
          ? await commitFixPlan(context.octokit, repoRef, prContext.headRef, prContext.headSha, plan)
          : undefined;
        const verificationCheckUrl = commitSha
          ? await createVerificationCheck(context.octokit, repoRef, commitSha, plan.verificationCommands)
          : undefined;
        const verificationWorkflowDispatched = commitSha
          ? await dispatchVerificationWorkflow(context.octokit, repoRef, prContext.headRef, commitSha, plan.verificationCommands)
          : false;

        await createIssueComment(
          context.octokit,
          repoRef,
          pullNumber,
          renderFixResult({
            plan,
            dryRun: fixCommand.options.dryRun,
            committed: Boolean(commitSha),
            commitSha,
            verificationCheckUrl,
            verificationWorkflowDispatched,
            fallbackReason: fallbackReason({ dryRun: fixCommand.options.dryRun, sameRepository, hasFiles: plan.files.length > 0 })
          })
        );
      }
    } catch (error) {
      context.log.error(error, "AI PR review failed");
      await updateReportComment(context.octokit, repoRef, reportCommentId, renderFailureComment(error));
    }
  });
}

export function isReviewCommand(body: string): boolean {
  return parseReviewCommand(body).shouldRun;
}

function fallbackReason(input: { dryRun: boolean; sameRepository: boolean; hasFiles: boolean }): string | undefined {
  if (input.dryRun) {
    return "dry-run 模式只生成修复计划。";
  }

  if (!input.sameRepository) {
    return "PR 来自 fork，Bot 不直接提交修复。";
  }

  if (!input.hasFiles) {
    return "没有可安全自动修复的文件。";
  }

  return undefined;
}

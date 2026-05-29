import "dotenv/config";
import type { Probot } from "probot";
import { PullRequestAnalyzer } from "./analyzer.js";
import { buildReviewOptions, parseReviewCommand } from "./command.js";
import {
  addEyesReaction,
  ensureReportComment,
  getReviewPolicy,
  getPullRequestContext,
  publishInlineReview,
  updateReportComment
} from "./github.js";
import { renderFailureComment, renderReport } from "./render.js";

export default function app(app: Probot) {
  app.on("issue_comment.created", async (context) => {
    const payload = context.payload;
    const commentBody = payload.comment.body ?? "";
    const command = parseReviewCommand(commentBody);

    if (!payload.issue.pull_request || !command.shouldRun) {
      return;
    }

    const repoRef = context.repo();
    const pullNumber = payload.issue.number;
    const triggerCommentId = payload.comment.id;
    const reportCommentId = await ensureReportComment(context.octokit, repoRef, pullNumber);

    await addEyesReaction(context.octokit, repoRef, triggerCommentId);

    try {
      const prContext = await getPullRequestContext(context.octokit, repoRef, pullNumber);
      const policy = await getReviewPolicy(context.octokit, repoRef, prContext.headSha);
      const options = buildReviewOptions(policy, command.overrides);
      const result = await new PullRequestAnalyzer().analyze(prContext, options);

      await updateReportComment(context.octokit, repoRef, reportCommentId, renderReport(result));
      await publishInlineReview(context.octokit, repoRef, pullNumber, prContext.headSha, result);
    } catch (error) {
      context.log.error(error, "AI PR review failed");
      await updateReportComment(context.octokit, repoRef, reportCommentId, renderFailureComment(error));
    }
  });
}

export function isReviewCommand(body: string): boolean {
  return parseReviewCommand(body).shouldRun;
}

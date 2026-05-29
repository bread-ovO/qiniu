import "dotenv/config";
import type { Probot } from "probot";
import { PullRequestAnalyzer } from "./analyzer.js";
import {
  addEyesReaction,
  ensureReportComment,
  getPullRequestContext,
  publishInlineReview,
  updateReportComment
} from "./github.js";
import { renderFailureComment, renderReport } from "./render.js";

export default function app(app: Probot) {
  app.on("issue_comment.created", async (context) => {
    const payload = context.payload;
    const commentBody = payload.comment.body ?? "";

    if (!payload.issue.pull_request || !isReviewCommand(commentBody)) {
      return;
    }

    const repoRef = context.repo();
    const pullNumber = payload.issue.number;
    const triggerCommentId = payload.comment.id;
    const reportCommentId = await ensureReportComment(context.octokit, repoRef, pullNumber);

    await addEyesReaction(context.octokit, repoRef, triggerCommentId);

    try {
      const prContext = await getPullRequestContext(context.octokit, repoRef, pullNumber);
      const result = await new PullRequestAnalyzer().analyze(prContext);

      await updateReportComment(context.octokit, repoRef, reportCommentId, renderReport(result));
      await publishInlineReview(context.octokit, repoRef, pullNumber, prContext.headSha, result);
    } catch (error) {
      context.log.error(error, "AI PR review failed");
      await updateReportComment(context.octokit, repoRef, reportCommentId, renderFailureComment(error));
    }
  });
}

export function isReviewCommand(body: string): boolean {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === "/ai-review");
}

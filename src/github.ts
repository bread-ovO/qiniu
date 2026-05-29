import { REPORT_MARKER, renderProcessingComment } from "./render.js";
import { DEFAULT_REVIEW_POLICY, parseReviewPolicy } from "./policy.js";
import type { AnalysisResult, PullRequestContext, ReviewPolicy } from "./types.js";

type Octokit = any;

interface RepoRef {
  owner: string;
  repo: string;
}

export async function getPullRequestContext(
  octokit: Octokit,
  repoRef: RepoRef,
  pullNumber: number
): Promise<PullRequestContext> {
  const [pull, files, commits] = await Promise.all([
    octokit.rest.pulls.get({ ...repoRef, pull_number: pullNumber }),
    octokit.paginate(octokit.rest.pulls.listFiles, { ...repoRef, pull_number: pullNumber, per_page: 100 }),
    octokit.paginate(octokit.rest.pulls.listCommits, { ...repoRef, pull_number: pullNumber, per_page: 100 })
  ]);

  return {
    ...repoRef,
    number: pullNumber,
    title: pull.data.title,
    body: pull.data.body ?? "",
    author: pull.data.user?.login ?? "unknown",
    baseRef: pull.data.base.ref,
    headRef: pull.data.head.ref,
    baseSha: pull.data.base.sha,
    headSha: pull.data.head.sha,
    commits: commits.map((commit: any) => commit.commit.message),
    files: files.map((file: any) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch,
      rawUrl: file.raw_url
    }))
  };
}

export async function getReviewPolicy(
  octokit: Octokit,
  repoRef: RepoRef,
  ref: string
): Promise<ReviewPolicy> {
  try {
    const response = await octokit.rest.repos.getContent({
      ...repoRef,
      path: ".ai-review.yml",
      ref
    });

    if (Array.isArray(response.data) || response.data.type !== "file" || !response.data.content) {
      return DEFAULT_REVIEW_POLICY;
    }

    return parseReviewPolicy(Buffer.from(response.data.content, "base64").toString("utf8"));
  } catch (error: any) {
    if (error.status === 404) {
      return DEFAULT_REVIEW_POLICY;
    }

    throw error;
  }
}

export async function ensureReportComment(
  octokit: Octokit,
  repoRef: RepoRef,
  issueNumber: number
): Promise<number> {
  const existing = await findReportComment(octokit, repoRef, issueNumber);
  if (existing) {
    await octokit.rest.issues.updateComment({
      ...repoRef,
      comment_id: existing,
      body: renderProcessingComment()
    });
    return existing;
  }

  const created = await octokit.rest.issues.createComment({
    ...repoRef,
    issue_number: issueNumber,
    body: renderProcessingComment()
  });
  return created.data.id;
}

export async function updateReportComment(
  octokit: Octokit,
  repoRef: RepoRef,
  commentId: number,
  body: string
): Promise<void> {
  await octokit.rest.issues.updateComment({ ...repoRef, comment_id: commentId, body });
}

export async function addEyesReaction(
  octokit: Octokit,
  repoRef: RepoRef,
  commentId: number
): Promise<void> {
  await octokit.rest.reactions.createForIssueComment({
    ...repoRef,
    comment_id: commentId,
    content: "eyes"
  });
}

export async function publishInlineReview(
  octokit: Octokit,
  repoRef: RepoRef,
  pullNumber: number,
  headSha: string,
  result: AnalysisResult
): Promise<void> {
  if (result.options.mode === "report") {
    return;
  }

  if (result.report.inlineSuggestions.length === 0) {
    return;
  }

  await octokit.rest.pulls.createReview({
    ...repoRef,
    pull_number: pullNumber,
    commit_id: headSha,
    event: "COMMENT",
    body: "AI 代码评审发现以下高置信度建议。",
    comments: result.report.inlineSuggestions.map((suggestion) => ({
      path: suggestion.file,
      line: suggestion.line,
      side: "RIGHT",
      body: `[${suggestion.severity.toUpperCase()} | 置信度 ${suggestion.confidence.toFixed(2)}]\n\n${suggestion.body}`
    }))
  });
}

async function findReportComment(
  octokit: Octokit,
  repoRef: RepoRef,
  issueNumber: number
): Promise<number | undefined> {
  const comments = await octokit.paginate(octokit.rest.issues.listComments, {
    ...repoRef,
    issue_number: issueNumber,
    per_page: 100
  });
  return comments.find((comment: any) => comment.body?.includes(REPORT_MARKER))?.id;
}

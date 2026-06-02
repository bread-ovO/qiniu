import { inferRelatedContextPaths } from "./context.js";
import { REPORT_MARKER, renderProcessingComment } from "./render.js";
import { DEFAULT_REVIEW_POLICY, parseReviewPolicy } from "./policy.js";
import { shouldSkipFile } from "./diff.js";
import type { AnalysisResult, FileSnapshot, FixPlan, PullRequestContext, ReviewPolicy } from "./types.js";

const AI_FIX_VERIFY_WORKFLOW = "ai-fix-verify.yml";

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
    headRepoOwner: pull.data.head.repo?.owner?.login ?? repoRef.owner,
    headRepoName: pull.data.head.repo?.name ?? repoRef.repo,
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

export async function getChangedFileSnapshots(
  octokit: Octokit,
  repoRef: RepoRef,
  ref: string,
  paths: string[]
): Promise<FileSnapshot[]> {
  const snapshots: FileSnapshot[] = [];

  for (const path of paths) {
    if (shouldSkipFile(path)) {
      continue;
    }

    const response = await octokit.rest.repos.getContent({
      ...repoRef,
      path,
      ref
    });

    if (Array.isArray(response.data) || response.data.type !== "file" || !response.data.content) {
      continue;
    }

    snapshots.push({
      path,
      content: Buffer.from(response.data.content, "base64").toString("utf8")
    });
  }

  return snapshots;
}

export async function getRelatedContextSnapshots(
  octokit: Octokit,
  repoRef: RepoRef,
  ref: string,
  changedPaths: string[]
): Promise<FileSnapshot[]> {
  return getRepositoryFileSnapshots(octokit, repoRef, ref, inferRelatedContextPaths(changedPaths));
}

export async function getRepositoryFileSnapshots(
  octokit: Octokit,
  repoRef: RepoRef,
  ref: string,
  paths: string[]
): Promise<FileSnapshot[]> {
  const snapshots: FileSnapshot[] = [];

  for (const path of paths) {
    try {
      const response = await octokit.rest.repos.getContent({
        ...repoRef,
        path,
        ref
      });

      if (Array.isArray(response.data) || response.data.type !== "file" || !response.data.content) {
        continue;
      }

      snapshots.push({
        path,
        content: Buffer.from(response.data.content, "base64").toString("utf8")
      });
    } catch (error: any) {
      if (error.status === 404) {
        continue;
      }

      throw error;
    }
  }

  return snapshots;
}

export async function dispatchVerificationWorkflow(
  octokit: Octokit,
  repoRef: RepoRef,
  ref: string,
  commitSha: string,
  verificationCommands: string[]
): Promise<boolean> {
  if (verificationCommands.length === 0) {
    return false;
  }

  try {
    await octokit.rest.actions.createWorkflowDispatch({
      ...repoRef,
      workflow_id: AI_FIX_VERIFY_WORKFLOW,
      ref,
      inputs: {
        commit_sha: commitSha,
        commands: verificationCommands.join("\n")
      }
    });

    return true;
  } catch (error: any) {
    if (error.status === 403 || error.status === 404) {
      return false;
    }

    throw error;
  }
}

export async function createVerificationCheck(
  octokit: Octokit,
  repoRef: RepoRef,
  headSha: string,
  verificationCommands: string[]
): Promise<string | undefined> {
  if (verificationCommands.length === 0) {
    return undefined;
  }

  try {
    const response = await octokit.rest.checks.create({
      ...repoRef,
      name: "AI Fix Verification Plan",
      head_sha: headSha,
      status: "completed",
      conclusion: "neutral",
      output: {
        title: "AI 修复验证计划",
        summary: [
          "Bot 已生成修复提交。请在 CI 或本地执行以下验证命令：",
          "",
          ...verificationCommands.map((command) => `- \`${command}\``)
        ].join("\n")
      }
    });

    return response.data.html_url;
  } catch (error: any) {
    if (error.status === 403 || error.status === 404) {
      return undefined;
    }

    throw error;
  }
}

export async function commitFixPlan(
  octokit: Octokit,
  repoRef: RepoRef,
  branch: string,
  expectedHeadSha: string,
  plan: FixPlan
): Promise<string> {
  const refName = `heads/${branch}`;
  const ref = await octokit.rest.git.getRef({ ...repoRef, ref: refName });
  const currentHeadSha = ref.data.object.sha;
  if (currentHeadSha !== expectedHeadSha) {
    throw new Error("PR head 已更新，请重新运行 /ai-fix。");
  }

  const headCommit = await octokit.rest.git.getCommit({ ...repoRef, commit_sha: currentHeadSha });
  const tree = [];

  for (const file of plan.files) {
    const blob = await octokit.rest.git.createBlob({
      ...repoRef,
      content: file.content,
      encoding: "utf-8"
    });
    tree.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blob.data.sha
    });
  }

  const newTree = await octokit.rest.git.createTree({
    ...repoRef,
    base_tree: headCommit.data.tree.sha,
    tree
  });
  const commit = await octokit.rest.git.createCommit({
    ...repoRef,
    message: `fix: apply AI generated PR fixes\n\n${plan.summary}`,
    tree: newTree.data.sha,
    parents: [currentHeadSha]
  });

  await octokit.rest.git.updateRef({
    ...repoRef,
    ref: refName,
    sha: commit.data.sha
  });

  return commit.data.sha;
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

export async function createIssueComment(
  octokit: Octokit,
  repoRef: RepoRef,
  issueNumber: number,
  body: string
): Promise<void> {
  await octokit.rest.issues.createComment({ ...repoRef, issue_number: issueNumber, body });
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

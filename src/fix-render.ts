import type { FixResult } from "./types.js";

export function renderFixResult(result: FixResult): string {
  const lines = [
    "## AI 自动修复",
    "",
    `**模式：** ${result.dryRun ? "dry-run" : "提交修复"}`,
    `**状态：** ${result.committed ? "已提交" : "未提交"}`,
    result.commitSha ? `**Commit：** ${result.commitSha}` : "",
    result.verificationCheckUrl ? `**Check Run：** ${result.verificationCheckUrl}` : "",
    result.verificationWorkflowDispatched ? "**Actions 验证：** 已触发" : "",
    result.fallbackReason ? `**原因：** ${result.fallbackReason}` : "",
    "",
    "### 修复摘要",
    result.plan.summary,
    "",
    "### 修改文件",
    ...renderFiles(result),
    "",
    "### 验证计划",
    ...renderList(result.plan.verificationCommands),
    "",
    "### 剩余风险",
    ...renderList(result.plan.risks)
  ];

  return lines.filter((line) => line !== "").join("\n");
}

function renderFiles(result: FixResult): string[] {
  if (result.plan.files.length === 0) {
    return ["暂无自动修复文件。"];
  }

  return result.plan.files.map((file) => `- \`${file.path}\`：${file.reason}`);
}

function renderList(items: string[]): string[] {
  if (items.length === 0) {
    return ["暂无。"];
  }

  return items.map((item) => `- ${item}`);
}

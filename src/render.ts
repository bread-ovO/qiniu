import type { AnalysisResult, ReviewReport } from "./types.js";

export const REPORT_MARKER = "<!-- ai-pr-review-bot:report -->";

const MODE_LABELS: Record<AnalysisResult["options"]["mode"], string> = {
  report: "仅报告",
  inline: "行内建议",
  all: "报告 + 行内建议"
};

const RISK_LABELS: Record<ReviewReport["riskLevel"], string> = {
  critical: "严重",
  high: "高",
  medium: "中",
  low: "低"
};

export function renderReport(result: AnalysisResult): string {
  const { report, durationMs, scannedFiles, skippedFiles } = result;
  const sections = [
    REPORT_MARKER,
    "## AI 代码评审",
    "",
    `**风险等级：** ${riskLabel(report.riskLevel)}  `,
    `**变更类型：** ${report.changeType}  `,
    `**运行模式：** ${MODE_LABELS[result.options.mode]}  `,
    `**行内评论置信度阈值：** ${result.options.minInlineConfidence.toFixed(2)}  `,
    `**分析范围：** ${scannedFiles} 个文件，耗时 ${(durationMs / 1000).toFixed(1)}s`,
    skippedFiles.length > 0 ? `**跳过文件：** ${skippedFiles.join(", ")}` : "",
    "",
    "### 变更总结",
    report.summary,
    "",
    renderList("### 关键变更", report.keyChanges),
    renderFindings(report),
    renderList("### 评审建议", report.reviewSuggestions),
    renderList("### 测试建议", report.testSuggestions)
  ];

  return sections.filter(Boolean).join("\n");
}

export function renderProcessingComment(): string {
  return `${REPORT_MARKER}\n## AI 代码评审\n\n正在分析，请稍候。`;
}

export function renderFailureComment(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${REPORT_MARKER}\n## AI 代码评审\n\n分析失败：${message}`;
}

function renderFindings(report: ReviewReport): string {
  if (report.riskFindings.length === 0) {
    return "### 风险发现\n未发现高置信度风险。";
  }

  const lines = ["### 风险发现"];
  for (const finding of report.riskFindings) {
    const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    lines.push(
      `- **${riskLabel(finding.severity)}** ${finding.title}（${location}，置信度 ${finding.confidence.toFixed(2)}）`,
      `  证据：${finding.evidence}`,
      `  影响：${finding.impact}`,
      `  建议：${finding.recommendation}`
    );
  }

  return lines.join("\n");
}

function renderList(title: string, items: string[]): string {
  if (items.length === 0) {
    return `${title}\n暂无。`;
  }

  return [title, ...items.map((item) => `- ${item}`)].join("\n");
}

function riskLabel(level: ReviewReport["riskLevel"]): string {
  return `${RISK_LABELS[level]}（${level}）`;
}

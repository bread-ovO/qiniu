import type { AnalysisResult, ReviewReport } from "./types.js";

export const REPORT_MARKER = "<!-- ai-pr-review-bot:report -->";

export function renderReport(result: AnalysisResult): string {
  const { report, durationMs, scannedFiles, skippedFiles } = result;
  const sections = [
    REPORT_MARKER,
    "## AI PR Review",
    "",
    `**Risk:** ${report.riskLevel.toUpperCase()}  `,
    `**Change type:** ${report.changeType}  `,
    `**Analyzed:** ${scannedFiles} files in ${(durationMs / 1000).toFixed(1)}s`,
    skippedFiles.length > 0 ? `**Skipped:** ${skippedFiles.join(", ")}` : "",
    "",
    "### Summary",
    report.summary,
    "",
    renderList("### Key Changes", report.keyChanges),
    renderFindings(report),
    renderList("### Review Suggestions", report.reviewSuggestions),
    renderList("### Test Suggestions", report.testSuggestions)
  ];

  return sections.filter(Boolean).join("\n");
}

export function renderProcessingComment(): string {
  return `${REPORT_MARKER}\n## AI PR Review\n\nAnalysis is running.`;
}

export function renderFailureComment(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${REPORT_MARKER}\n## AI PR Review\n\nAnalysis failed: ${message}`;
}

function renderFindings(report: ReviewReport): string {
  if (report.riskFindings.length === 0) {
    return "### Risk Findings\nNo high-confidence risks found.";
  }

  const lines = ["### Risk Findings"];
  for (const finding of report.riskFindings) {
    const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    lines.push(
      `- **${finding.severity.toUpperCase()}** ${finding.title} (${location}, confidence ${finding.confidence.toFixed(2)})`,
      `  Evidence: ${finding.evidence}`,
      `  Impact: ${finding.impact}`,
      `  Recommendation: ${finding.recommendation}`
    );
  }

  return lines.join("\n");
}

function renderList(title: string, items: string[]): string {
  if (items.length === 0) {
    return `${title}\nNone.`;
  }

  return [title, ...items.map((item) => `- ${item}`)].join("\n");
}

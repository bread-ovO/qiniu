import OpenAI from "openai";
import { loadConfig } from "./config.js";
import { buildDiffIndex, filterInlineSuggestions, formatDiffForModel } from "./diff.js";
import { REVIEW_JSON_SCHEMA, SYSTEM_PROMPT } from "./prompts.js";
import { reviewReportSchema } from "./schemas.js";
import type { AnalysisResult, PullRequestContext, ReviewOptions, ReviewReport } from "./types.js";

export class PullRequestAnalyzer {
  private readonly client: OpenAI;
  private readonly config = loadConfig();

  constructor(client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })) {
    this.client = client;
  }

  async analyze(pr: PullRequestContext, options?: ReviewOptions): Promise<AnalysisResult> {
    const startedAt = Date.now();
    const resolvedOptions = options ?? {
      mode: "all" as const,
      maxInlineComments: this.config.maxInlineComments,
      minInlineConfidence: this.config.minInlineConfidence,
      maxDiffChars: this.config.maxDiffChars,
      policy: { ignorePaths: [], reviewInstructions: [] }
    };
    const { content, skippedFiles } = formatDiffForModel(
      pr.files,
      resolvedOptions.maxDiffChars,
      resolvedOptions.policy.ignorePaths
    );
    const diffIndex = buildDiffIndex(pr.files);
    const rawReport = await this.callModel(pr, content, skippedFiles, resolvedOptions);
    const report = this.normalizeReport(rawReport);

    report.inlineSuggestions = filterInlineSuggestions(
      report.inlineSuggestions,
      diffIndex,
      resolvedOptions.maxInlineComments,
      resolvedOptions.minInlineConfidence
    );

    return {
      report,
      durationMs: Date.now() - startedAt,
      skippedFiles,
      scannedFiles: pr.files.length - skippedFiles.length,
      options: resolvedOptions
    };
  }

  private async callModel(
    pr: PullRequestContext,
    diffContent: string,
    skippedFiles: string[],
    options: ReviewOptions
  ): Promise<ReviewReport> {
    const input = buildModelInput(pr, diffContent, skippedFiles, options);
    const response = await this.client.responses.create({
      model: this.config.openAIModel,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: input }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "review_report",
          schema: REVIEW_JSON_SCHEMA,
          strict: true
        }
      }
    });

    const outputText = response.output_text;
    if (!outputText) {
      throw new Error("OpenAI returned an empty response");
    }

    return reviewReportSchema.parse(JSON.parse(outputText));
  }

  private normalizeReport(report: ReviewReport): ReviewReport {
    return {
      ...report,
      keyChanges: report.keyChanges.slice(0, 8),
      riskFindings: report.riskFindings
        .filter((finding) => finding.confidence >= 0.45)
        .slice(0, 12),
      reviewSuggestions: report.reviewSuggestions.slice(0, 10),
      testSuggestions: report.testSuggestions.slice(0, 10),
      inlineSuggestions: report.inlineSuggestions.slice(0, 10)
    };
  }
}

function buildModelInput(
  pr: PullRequestContext,
  diffContent: string,
  skippedFiles: string[],
  options: ReviewOptions
): string {
  return [
    "请评审这个 GitHub Pull Request。",
    "",
    "Pull Request 元数据：",
    JSON.stringify(
      {
        repository: `${pr.owner}/${pr.repo}`,
        number: pr.number,
        title: pr.title,
        body: pr.body,
        author: pr.author,
        baseRef: pr.baseRef,
        headRef: pr.headRef,
        baseSha: pr.baseSha,
        headSha: pr.headSha,
        commits: pr.commits,
        changedFiles: pr.files.map((file) => ({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          changes: file.changes
        })),
        skippedFiles
      },
      null,
      2
    ),
    "",
    "团队评审策略：",
    JSON.stringify(
      {
        ignorePaths: options.policy.ignorePaths,
        reviewInstructions: options.policy.reviewInstructions,
        minInlineConfidence: options.minInlineConfidence,
        maxInlineComments: options.maxInlineComments
      },
      null,
      2
    ),
    "",
    "Unified diff：",
    diffContent || "没有可用的文本 diff。"
  ].join("\n");
}

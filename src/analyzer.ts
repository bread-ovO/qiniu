import OpenAI from "openai";
import { type AppConfig, loadConfig } from "./config.js";
import { buildDiffIndex, filterInlineSuggestions, formatDiffForModel } from "./diff.js";
import { REPAIR_PROMPT, REVIEW_JSON_SCHEMA, SYSTEM_PROMPT } from "./prompts.js";
import { reviewReportSchema } from "./schemas.js";
import type { AnalysisResult, PullRequestContext, ReviewOptions, ReviewReport } from "./types.js";

export class PullRequestAnalyzer {
  private readonly client: OpenAI;
  private readonly config: AppConfig;

  constructor(client?: OpenAI, config = loadConfig()) {
    this.config = config;
    this.client = client ?? createOpenAIClient(config);
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
    const outputText =
      this.config.openAIApiMode === "chat"
        ? await this.callChatCompletions(input)
        : await this.callResponses(input);

    const parsed = parseReport(outputText);
    if (parsed.ok) {
      return parsed.report;
    }

    const repairedOutputText = await this.repairModelOutput(outputText, parsed.error);
    const repaired = parseReport(repairedOutputText);
    if (repaired.ok) {
      return repaired.report;
    }

    throw buildParseError(repaired, repairedOutputText);
  }

  private async callResponses(input: string): Promise<string> {
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

    return outputText;
  }

  private async callChatCompletions(input: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.config.openAIModel,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: input }
      ],
      response_format: buildChatResponseFormat(this.config.openAIChatResponseFormat)
    } as any);
    const outputText = response.choices?.[0]?.message?.content;

    if (!outputText) {
      throw new Error(
        [
          "OpenAI-compatible API returned an invalid Chat Completions response.",
          "Check OPENAI_BASE_URL ends with /v1, OPENAI_API_MODE=chat, and OPENAI_MODEL is available in the gateway.",
          `Response preview: ${previewResponse(response)}`
        ].join(" ")
      );
    }

    return outputText;
  }

  private async repairModelOutput(outputText: string, error: string): Promise<string> {
    const input = [
      "下面是一个模型返回的 PR 评审 JSON，但它不符合目标 schema。",
      "请只修复结构和字段类型，保留原有信息含义。",
      "缺失字段使用空数组、空字符串或 low 风险默认值补齐。",
      "",
      "校验错误：",
      error,
      "",
      "原始输出：",
      outputText
    ].join("\n");

    if (this.config.openAIApiMode === "chat") {
      return this.callChatCompletionsWithPrompt(REPAIR_PROMPT, input);
    }

    return this.callResponsesWithPrompt(REPAIR_PROMPT, input);
  }

  private async callChatCompletionsWithPrompt(systemPrompt: string, input: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.config.openAIModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: input }
      ],
      response_format: buildChatResponseFormat(this.config.openAIChatResponseFormat)
    } as any);
    const outputText = response.choices?.[0]?.message?.content;

    if (!outputText) {
      throw new Error(
        [
          "OpenAI-compatible API returned an invalid Chat Completions response.",
          "Check OPENAI_BASE_URL ends with /v1, OPENAI_API_MODE=chat, and OPENAI_MODEL is available in the gateway.",
          `Response preview: ${previewResponse(response)}`
        ].join(" ")
      );
    }

    return outputText;
  }

  private async callResponsesWithPrompt(systemPrompt: string, input: string): Promise<string> {
    const response = await this.client.responses.create({
      model: this.config.openAIModel,
      input: [
        { role: "system", content: systemPrompt },
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

    return outputText;
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

function createOpenAIClient(config: AppConfig): OpenAI {
  return new OpenAI({
    apiKey: config.openAIAPIKey,
    baseURL: config.openAIBaseURL
  });
}

type ParseReportResult = { ok: true; report: ReviewReport } | { ok: false; error: string };

export function parseReport(outputText: string): ParseReportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    return {
      ok: false,
      error: `模型返回内容不是合法 JSON。${error instanceof Error ? error.message : String(error)}`
    };
  }

  const result = reviewReportSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }

  return { ok: true, report: result.data };
}

function buildParseError(result: ParseReportResult, outputText: string): Error {
  if (result.ok) {
    return new Error("模型输出解析状态异常。");
  }

  return new Error(
    [
      "模型返回 JSON 结构不符合评审报告契约，自动修复后仍然失败。",
      `校验错误：${result.error}`,
      `输出预览：${previewResponse(outputText)}`
    ].join(" ")
  );
}

function buildChatResponseFormat(format: AppConfig["openAIChatResponseFormat"]): object {
  if (format === "json_schema") {
    return {
      type: "json_schema",
      json_schema: {
        name: "review_report",
        schema: REVIEW_JSON_SCHEMA,
        strict: true
      }
    };
  }

  return { type: "json_object" };
}

function previewResponse(response: unknown): string {
  if (typeof response === "string") {
    return response.slice(0, 300);
  }

  try {
    return JSON.stringify(response).slice(0, 500);
  } catch {
    return String(response).slice(0, 300);
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

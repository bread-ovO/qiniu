import OpenAI from "openai";
import { type AppConfig, loadConfig } from "./config.js";
import { inferVerificationCommands } from "./verifier.js";
import { FIX_JSON_SCHEMA, FIX_PROMPT } from "./prompts.js";
import { fixPlanSchema } from "./schemas.js";
import type { FileSnapshot, FixCommandOptions, FixPlan, PullRequestContext, ReviewReport } from "./types.js";

export class PullRequestFixer {
  private readonly client: OpenAI;
  private readonly config: AppConfig;

  constructor(client?: OpenAI, config = loadConfig()) {
    this.config = config;
    this.client = client ?? new OpenAI({ apiKey: config.openAIAPIKey, baseURL: config.openAIBaseURL });
  }

  async createFixPlan(
    pr: PullRequestContext,
    report: ReviewReport,
    snapshots: FileSnapshot[],
    options: FixCommandOptions,
    verificationSnapshots: FileSnapshot[] = []
  ): Promise<FixPlan> {
    const eligibleFindings = report.riskFindings.filter((finding) => finding.confidence >= 0.8);
    if (eligibleFindings.length === 0) {
      return {
        summary: "没有发现适合自动修复的高置信度问题。",
        confidence: 0,
        files: [],
        verificationCommands: [],
        risks: ["当前报告中没有 confidence >= 0.8 的风险项。"]
      };
    }

    const input = buildFixInput(pr, report, snapshots, options);
    const outputText =
      this.config.openAIApiMode === "chat" ? await this.callChat(input) : await this.callResponses(input);
    return normalizeFixPlan(parseFixPlan(outputText), snapshots, options, verificationSnapshots);
  }

  private async callChat(input: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.config.openAIModel,
      messages: [
        { role: "system", content: FIX_PROMPT },
        { role: "user", content: input }
      ],
      response_format:
        this.config.openAIChatResponseFormat === "json_schema"
          ? { type: "json_schema", json_schema: { name: "fix_plan", schema: FIX_JSON_SCHEMA, strict: true } }
          : { type: "json_object" }
    } as any);
    const outputText = response.choices?.[0]?.message?.content;
    if (!outputText) {
      throw new Error("OpenAI-compatible API returned an empty fix response.");
    }

    return outputText;
  }

  private async callResponses(input: string): Promise<string> {
    const response = await this.client.responses.create({
      model: this.config.openAIModel,
      input: [
        { role: "system", content: FIX_PROMPT },
        { role: "user", content: input }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "fix_plan",
          schema: FIX_JSON_SCHEMA,
          strict: true
        }
      }
    });
    if (!response.output_text) {
      throw new Error("OpenAI returned an empty fix response.");
    }

    return response.output_text;
  }
}

export function parseFixPlan(outputText: string): FixPlan {
  return fixPlanSchema.parse(JSON.parse(outputText));
}

export function validateFixPlan(
  plan: FixPlan,
  snapshots: FileSnapshot[],
  options: FixCommandOptions,
  verificationSnapshots: FileSnapshot[] = []
): FixPlan {
  return normalizeFixPlan(plan, snapshots, options, verificationSnapshots);
}

function normalizeFixPlan(
  plan: FixPlan,
  snapshots: FileSnapshot[],
  options: FixCommandOptions,
  verificationSnapshots: FileSnapshot[] = []
): FixPlan {
  const allowedPaths = new Set(snapshots.map((snapshot) => snapshot.path));
  const files = plan.files
    .filter((file) => allowedPaths.has(file.path))
    .filter((file) => file.content.trim().length > 0)
    .slice(0, options.maxFiles);

  return {
    ...plan,
    files,
    verificationCommands: inferVerificationCommands(verificationSnapshots, plan.verificationCommands),
    risks: plan.risks.slice(0, 8)
  };
}

function buildFixInput(
  pr: PullRequestContext,
  report: ReviewReport,
  snapshots: FileSnapshot[],
  options: FixCommandOptions
): string {
  return [
    "请为这个 Pull Request 生成安全、保守的自动修复计划。",
    "",
    "限制：",
    JSON.stringify(
      {
        dryRun: options.dryRun,
        maxFiles: options.maxFiles,
        allowedPaths: snapshots.map((snapshot) => snapshot.path)
      },
      null,
      2
    ),
    "",
    "Pull Request：",
    JSON.stringify(
      {
        repository: `${pr.owner}/${pr.repo}`,
        number: pr.number,
        title: pr.title,
        headRef: pr.headRef,
        headSha: pr.headSha
      },
      null,
      2
    ),
    "",
    "高置信度风险：",
    JSON.stringify(
      report.riskFindings.filter((finding) => finding.confidence >= 0.8),
      null,
      2
    ),
    "",
    "候选文件完整内容：",
    snapshots.map((snapshot) => `--- ${snapshot.path}\n${snapshot.content}`).join("\n\n")
  ].join("\n");
}

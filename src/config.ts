export type OpenAIApiMode = "responses" | "chat";

export interface AppConfig {
  openAIAPIKey?: string;
  openAIModel: string;
  openAIBaseURL?: string;
  openAIApiMode: OpenAIApiMode;
  openAIChatResponseFormat: "json_object" | "json_schema";
  maxInlineComments: number;
  minInlineConfidence: number;
  maxDiffChars: number;
}

export function loadConfig(): AppConfig {
  const config = {
    openAIAPIKey: process.env.OPENAI_API_KEY,
    openAIModel: process.env.OPENAI_MODEL ?? "gpt-5.2",
    openAIBaseURL: emptyToUndefined(process.env.OPENAI_BASE_URL),
    openAIApiMode: parseApiMode(process.env.OPENAI_API_MODE),
    openAIChatResponseFormat: parseChatResponseFormat(process.env.OPENAI_CHAT_RESPONSE_FORMAT),
    maxInlineComments: Number.parseInt(process.env.MAX_INLINE_COMMENTS ?? "5", 10),
    minInlineConfidence: Number.parseFloat(process.env.MIN_INLINE_CONFIDENCE ?? "0.75"),
    maxDiffChars: Number.parseInt(process.env.MAX_DIFF_CHARS ?? "120000", 10)
  };
  validateConfig(config);
  return config;
}

function parseApiMode(value: string | undefined): OpenAIApiMode {
  return value === "chat" ? "chat" : "responses";
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

function parseChatResponseFormat(value: string | undefined): "json_object" | "json_schema" {
  return value === "json_schema" ? "json_schema" : "json_object";
}

export function validateConfig(config: AppConfig): void {
  const errors: string[] = [];

  if (!config.openAIAPIKey) {
    errors.push("OPENAI_API_KEY 不能为空。");
  }

  if (!config.openAIModel) {
    errors.push("OPENAI_MODEL 不能为空。");
  }

  if (config.openAIApiMode === "chat" && !config.openAIBaseURL?.endsWith("/v1")) {
    errors.push("OPENAI_API_MODE=chat 时，OPENAI_BASE_URL 必须指向 OpenAI-compatible /v1 地址，例如 https://example.com/v1。");
  }

  if (!Number.isInteger(config.maxInlineComments) || config.maxInlineComments < 0) {
    errors.push("MAX_INLINE_COMMENTS 必须是大于等于 0 的整数。");
  }

  if (!Number.isFinite(config.minInlineConfidence) || config.minInlineConfidence < 0 || config.minInlineConfidence > 1) {
    errors.push("MIN_INLINE_CONFIDENCE 必须是 0 到 1 之间的数字。");
  }

  if (!Number.isInteger(config.maxDiffChars) || config.maxDiffChars <= 0) {
    errors.push("MAX_DIFF_CHARS 必须是大于 0 的整数。");
  }

  if (errors.length > 0) {
    throw new Error(`配置错误：\n- ${errors.join("\n- ")}`);
  }
}

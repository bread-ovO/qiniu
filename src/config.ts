export type OpenAIApiMode = "responses" | "chat";

export interface AppConfig {
  openAIAPIKey?: string;
  openAIModel: string;
  openAIBaseURL?: string;
  openAIApiMode: OpenAIApiMode;
  maxInlineComments: number;
  minInlineConfidence: number;
  maxDiffChars: number;
}

export function loadConfig(): AppConfig {
  return {
    openAIAPIKey: process.env.OPENAI_API_KEY,
    openAIModel: process.env.OPENAI_MODEL ?? "gpt-5.2",
    openAIBaseURL: emptyToUndefined(process.env.OPENAI_BASE_URL),
    openAIApiMode: parseApiMode(process.env.OPENAI_API_MODE),
    maxInlineComments: Number.parseInt(process.env.MAX_INLINE_COMMENTS ?? "5", 10),
    minInlineConfidence: Number.parseFloat(process.env.MIN_INLINE_CONFIDENCE ?? "0.75"),
    maxDiffChars: Number.parseInt(process.env.MAX_DIFF_CHARS ?? "120000", 10)
  };
}

function parseApiMode(value: string | undefined): OpenAIApiMode {
  return value === "chat" ? "chat" : "responses";
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

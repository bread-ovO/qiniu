export interface AppConfig {
  openAIModel: string;
  maxInlineComments: number;
  minInlineConfidence: number;
  maxDiffChars: number;
}

export function loadConfig(): AppConfig {
  return {
    openAIModel: process.env.OPENAI_MODEL ?? "gpt-5.2",
    maxInlineComments: Number.parseInt(process.env.MAX_INLINE_COMMENTS ?? "5", 10),
    minInlineConfidence: Number.parseFloat(process.env.MIN_INLINE_CONFIDENCE ?? "0.75"),
    maxDiffChars: Number.parseInt(process.env.MAX_DIFF_CHARS ?? "120000", 10)
  };
}

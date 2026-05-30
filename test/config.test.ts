import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("loads OpenAI-compatible API settings", () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "qwen-plus";
    process.env.OPENAI_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
    process.env.OPENAI_API_MODE = "chat";

    expect(loadConfig()).toMatchObject({
      openAIAPIKey: "test-key",
      openAIModel: "qwen-plus",
      openAIBaseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      openAIApiMode: "chat",
      openAIChatResponseFormat: "json_object"
    });
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { validateStartupEnv } from "../src/env.js";

describe("validateStartupEnv", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("rejects missing GitHub app settings", () => {
    process.env = {
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-5.2",
      OPENAI_API_MODE: "responses"
    };

    expect(() => validateStartupEnv()).toThrow("APP_ID 不能为空");
  });

  it("rejects one-line private keys", () => {
    process.env = {
      APP_ID: "123",
      PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----abc-----END RSA PRIVATE KEY-----",
      WEBHOOK_SECRET: "secret",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-5.2",
      OPENAI_API_MODE: "responses"
    };

    expect(() => validateStartupEnv()).toThrow("PRIVATE_KEY 必须保留换行");
  });

  it("accepts a valid minimal startup configuration", () => {
    process.env = {
      APP_ID: "123",
      PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----",
      WEBHOOK_SECRET: "secret",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-5.2",
      OPENAI_API_MODE: "responses"
    };

    expect(() => validateStartupEnv()).not.toThrow();
  });
});

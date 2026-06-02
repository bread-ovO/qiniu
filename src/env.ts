import { loadConfig } from "./config.js";

const REQUIRED_GITHUB_ENV = ["APP_ID", "PRIVATE_KEY", "WEBHOOK_SECRET"] as const;

export function validateStartupEnv(): void {
  const errors = [
    ...validateGitHubEnv(),
    ...validatePrivateKey(process.env.PRIVATE_KEY)
  ];

  try {
    loadConfig();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  if (errors.length > 0) {
    throw new Error(`启动配置错误：\n- ${errors.join("\n- ")}`);
  }
}

function validateGitHubEnv(): string[] {
  return REQUIRED_GITHUB_ENV
    .filter((name) => !process.env[name])
    .map((name) => `${name} 不能为空。`);
}

function validatePrivateKey(privateKey: string | undefined): string[] {
  if (!privateKey) {
    return [];
  }

  const errors: string[] = [];
  if (!privateKey.includes("-----BEGIN") || !privateKey.includes("PRIVATE KEY-----")) {
    errors.push("PRIVATE_KEY 看起来不是完整 pem 内容。请复制 GitHub App 下载的 .pem 文件全部内容。");
  }

  if (!privateKey.includes("\n")) {
    errors.push("PRIVATE_KEY 必须保留换行，并在 .env 中用双引号包住多行内容。");
  }

  return errors;
}

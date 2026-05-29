# AI PR Review Bot

这是一个 GitHub App 形态的 AI 代码评审助手。开发者在 Pull Request 中评论 `/ai-review` 后，Bot 会自动获取 PR 变更，调用 OpenAI 做结构化分析，更新一条评审报告评论，并发布少量高置信度的 inline review 建议。

## 功能

- 生成 PR 变更总结、变更类型和整体风险等级。
- 识别正确性、安全、兼容性、并发、性能、错误处理和测试缺口相关风险。
- 输出基于 diff 证据的 Review 建议和测试建议。
- 只把高置信度且能映射到新增行的建议发布为 inline 评论。
- 通过隐藏 marker 复用同一条报告评论，重复触发时更新原报告。
- 自动跳过 lockfile、构建产物、快照文件和压缩资源，降低延迟与 token 成本。

## 快速开始

```bash
npm install
cp .env.example .env
npm run dev
```

创建 GitHub App，并配置权限：

- Pull requests: read/write
- Contents: read
- Issues: read/write
- Metadata: read

订阅事件：

- Issue comment

本地调试时可以使用 Smee 或 ngrok 把 GitHub webhook 转发到本地 Probot 服务。

## 环境变量

```bash
APP_ID=12345
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."
WEBHOOK_SECRET=...
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.2
MAX_INLINE_COMMENTS=5
MAX_DIFF_CHARS=120000
```

## 工作流程

1. 开发者在 PR 评论 `/ai-review`。
2. Bot 给触发评论添加 `eyes` reaction，并创建或更新 AI 评审报告评论。
3. Bot 获取 PR 标题、描述、作者、分支、commit message、文件列表和 unified diff。
4. Bot 过滤 lockfile、生成文件、快照、构建目录和压缩资源。
5. OpenAI 按 JSON Schema 返回结构化评审结果。
6. Bot 过滤 inline 建议，仅保留 `confidence >= 0.75` 且位于新增 diff 行的建议。
7. Bot 更新总报告评论，并发布高置信度 inline review。

## 模型选择

默认模型是 `gpt-5.2`，适合作为代码理解和 agentic task 的主力模型。模型名通过 `OPENAI_MODEL` 配置，团队可以按场景切换到更快或成本更低的模型。

系统使用 OpenAI Responses API 的 JSON Schema 输出能力，让模型结果保持可解析、可校验、可过滤。Bot 会在发布前再次校验结构、置信度和 diff 行号，降低误报带来的 Review 噪音。

## 上下文获取方式

第一版优先保证速度和信号密度：

- 始终包含 PR 标题、描述、作者、base/head 分支、commit message 和文件变更元数据。
- 按 `MAX_DIFF_CHARS` 限制 unified diff 输入规模。
- 跳过生成文件和 lockfile。
- 要求每条风险都引用 diff 中的具体证据。
- 低置信度内容进入总报告，高置信度且可定位的内容进入 inline 评论。

## 本地开发

```bash
npm run typecheck
npm test
npm run build
```

## 未来扩展

- 仓库级索引：补充跨文件调用链、历史实现和测试覆盖上下文。
- 团队策略文件：通过 `.ai-review.yml` 配置重点关注的风险、忽略路径和严重等级阈值。
- CI 集成：只在 critical 且高置信度的风险上阻塞合并。
- 反馈学习：记录人工采纳、驳回和修改建议，持续调整提示词和阈值。
- 多模型复核：对安全敏感 PR 使用第二模型交叉验证。
- Web Dashboard：展示评审历史、耗时、token 使用、误报率和高风险模块趋势。

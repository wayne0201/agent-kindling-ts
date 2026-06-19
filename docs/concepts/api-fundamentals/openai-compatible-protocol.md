---
concept: OpenAI 兼容协议
tags: [api-basics, cost-control]
last_updated: 2026-06-19
---

# 概念：OpenAI 兼容协议

## 📖 一句话定义

第三方模型厂商提供与 OpenAI API 格式一致的接口端点，开发者只需修改 `baseURL`，即可用同一套 OpenAI SDK 接入不同厂商的模型。

## ⚙️ 深入原理

OpenAI 的 Chat Completions API 已成为事实上的行业标准。大量模型厂商（智谱 GLM、Anthropic Claude、DeepSeek、月之暗面 Kimi 等）为了降低用户迁移成本，都提供了**与 OpenAI API 格式完全兼容**的 HTTP 端点。

技术上只需两步适配：

1. **复用 OpenAI SDK**：安装官方 `openai` npm 包，创建 `OpenAI` 客户端实例。
2. **改写 `baseURL`**：将默认的 `https://api.openai.com/v1` 替换为厂商的兼容端点。本项目使用智谱 GLM：

```typescript
const client = new OpenAI({
  apiKey: process.env.ZHIPU_API_KEY,
  baseURL: process.env.ZHIPU_BASE_URL, // https://open.bigmodel.cn/api/paas/v4
});
```

此后所有调用（`client.chat.completions.create(...)` 等）的代码写法与对接 OpenAI 时**完全一致**——请求参数结构、响应结构、流式处理方式都对齐。模型名通过 `model` 字段指定（如 `glm-4.6`）。

## 🛠️ 在 Agent 架构中的作用

**解耦模型与代码**：Agent 代码不绑定特定模型厂商。通过环境变量切换 `baseURL` 和 `apiKey`，同一份代码可在 GLM、DeepSeek、OpenAI 之间无缝切换。这对成本控制（用更便宜的国产模型替代）和模型可替换性（随时切换更优模型）都至关重要。

## 🔗 相关代码落地

- [Stage 1 · Step 1 - 环境破冰与第一次调用](../stages/stage-01/step-01.md)

## 🧩 关联概念

- [Chat Completion API](./api-fundamentals/chat-completion-api.md)
- [环境变量与防呆设计](../engineering-practice/env-and-fail-fast.md)

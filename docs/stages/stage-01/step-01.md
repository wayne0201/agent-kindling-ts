---
title: 环境破冰与第一次调用
date: 2026-06-19
stage: 1
step: 1
tags: [api-basics, openai-sdk, env-setup]
status: done
related_demo: ../../demos/stage-01/step-01/hello-glm.ts
---

# Step 1: 环境破冰与第一次调用

## 🎯 本环节目标

配置 Node.js + TypeScript 运行环境，使用 OpenAI 兼容 SDK 成功与智谱 GLM 模型通信，并打印返回结果。理解 Chat Completion API 的基本结构（`messages` 列表、`role` 类型），建立"环境防呆"意识。

## 💡 核心原理速记

- **Chat Completion API**：大模型最基础的交互接口。客户端发送一个 `messages` 数组（每条消息带 `role` 和 `content`），模型返回一条 `assistant` 回复。详见 [Chat Completion API](../../concepts/api-fundamentals/chat-completion-api.md)。
- **OpenAI 兼容协议**：智谱 GLM 等国产模型提供与 OpenAI API 格式一致的端点，只需改 `baseURL` 即可用同一套 SDK 接入不同模型。详见 [OpenAI 兼容协议](../../concepts/api-fundamentals/openai-compatible-protocol.md)。
- **环境变量与防呆设计**：API Key 等敏感配置通过 `.env` 文件 + `dotenv` 加载到 `process.env`，在程序启动时校验关键字段，缺失则立即 `process.exit(1)` 并给出修复指引。详见 [环境变量与防呆设计](../../concepts/engineering-practice/env-and-fail-fast.md)。
- **Token 消耗**：每次 API 调用消耗两类 token——`prompt_tokens`（输入侧）和 `completion_tokens`（输出侧），是成本控制的基础指标。

## 💻 落地内容与代码

**代码实现**: [demos/stage-01/step-01/hello-glm.ts](../../demos/stage-01/step-01/hello-glm.ts)

**核心逻辑简述**:
1. `dotenv.config()` 从 `.env` 文件加载环境变量。
2. 校验 `ZHIPU_API_KEY` 是否存在，不存在则报错退出。
3. 创建 `OpenAI` 客户端实例，将 `baseURL` 指向智谱 GLM 的兼容端点。
4. 调用 `client.chat.completions.create()`，传入 `model`、`messages` 参数。
5. 从响应中提取 `choices[0].message.content` 和 `usage` 统计，打印输出。

**代码亮点**:
- System Prompt 设定为「严谨但充满热情的编程导师」，通过角色设定引导模型输出风格。
- `try/catch` 包裹网络请求，避免 API 异常导致进程崩溃。
- 打印 `prompt_tokens` / `completion_tokens`，建立成本意识。

## 🧠 相关知识点沉淀

- [Chat Completion API](../../concepts/api-fundamentals/chat-completion-api.md)
- [OpenAI 兼容协议](../../concepts/api-fundamentals/openai-compatible-protocol.md)
- [环境变量与防呆设计](../../concepts/engineering-practice/env-and-fail-fast.md)

## 🐞 踩坑记录与思考

- **问题**: 首次运行时报 `401 Unauthorized`，原因是 `.env` 文件未创建或 `ZHIPU_API_KEY` 为空。
  - **解决**: 运行 `pnpm initEnv`（即 `cp .env.example .env`）生成 `.env` 文件，填入真实 API Key。代码中的防呆校验会在启动时拦截此类问题并给出明确提示。
- **问题**: `tsconfig.json` 中 `noEmit: true`，但 `outDir` 仍配置为 `./dist`。
  - **思考**: 不影响运行（tsx 直接执行 `.ts`），但 `outDir` 是误导性配置，可在后续清理时移除。

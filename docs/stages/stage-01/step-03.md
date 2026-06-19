---
title: 流式输出的艺术
date: 2026-06-19
stage: 1
step: 3
tags: [api-basics, streaming, sse]
status: done
related_demo: ../../demos/stage-01/step-03/stream-chat.ts
---

# Step 3: 流式输出的艺术

## 🎯 本环节目标

理解 Server-Sent Events (SSE) 的工作原理，掌握 `stream: true` 参数，实现终端「打字机」效果逐字打印，并正确处理 chunk 数据拼接。

## 💡 核心原理速记

- **SSE (Server-Sent Events)**：一种基于 HTTP 长连接的服务端推送技术。客户端发送请求后，服务端不一次性返回完整响应，而是持续发送 `data:` 前缀的事件流，每个事件是一个 JSON 片段（chunk）。
- **`stream: true`**：Chat Completion API 的参数。设为 `true` 后，API 返回的不再是单个 `ChatCompletion` 对象，而是一个 async iterable，每个元素是一个 `ChatCompletionChunk`。
- **`delta` vs `message`**：流式响应中用 `choices[0].delta.content` 获取增量内容（非流式用 `choices[0].message.content` 获取完整内容）。`delta` 只包含本次 chunk 新增的文本，需要手动拼接。
- **`finish_reason`**：流式最后一个 chunk 的 `finish_reason` 会变为 `stop`（自然结束）或 `length`（被截断），中间 chunk 的 `finish_reason` 为 `null`。

## 💻 落地内容与代码

**代码实现**: [demos/stage-01/step-03/stream-chat.ts](../../demos/stage-01/step-03/stream-chat.ts)

**核心逻辑简述**:
1. 调用 `client.chat.completions.create()` 时传入 `stream: true`，获得 async iterable。
2. 用 `for await...of` 遍历每个 chunk，提取 `delta.content`，用 `process.stdout.write()` 逐字打印。
3. 手动拼接 `fullContent`，在流结束后输出完整文本和统计信息。
4. 对比实验：用相同 Prompt 分别发流式和非流式请求，验证拼接完整性。

**代码亮点**:
- `process.stdout.write()` 而非 `console.log()`，避免每个 chunk 后自动换行，实现真正的打字机效果。
- 检测 `finish_reason` 判断流结束原因，与 Step 2 的截断知识衔接。
- 对比实验验证流式拼接的正确性（注意：因模型随机性，两次请求内容可能不同，属正常现象）。

## 🧠 相关知识点沉淀

- [流式输出与 SSE](../../concepts/api-fundamentals/streaming-and-sse.md)
- [Chat Completion API](../../concepts/api-fundamentals/chat-completion-api.md)（流式是该 API 的 `stream` 模式）

## 🐞 踩坑记录与思考

- **注意**: `delta.content` 可能为 `undefined`（如最后一个 chunk 只携带 `finish_reason`，无文本内容），必须用 `?? ''` 兜底。
- **注意**: 流式响应没有 `usage` 字段（部分模型厂商在最后一个 chunk 中返回，但非标准行为），如需 token 统计需额外处理。
- **思考**: 流式输出的核心价值是「用户体验」——首字延迟（Time To First Token, TTFT）大幅降低，用户无需等待完整生成即可看到输出。在 Agent 场景中，流式对长推理链路尤其重要。

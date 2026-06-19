---
concept: 流式输出与 SSE
tags: [api-basics, streaming, core-mechanism]
last_updated: 2026-06-19
---

# 概念：流式输出与 SSE

## 📖 一句话定义

通过 `stream: true` 参数，让 Chat Completion API 以 Server-Sent Events (SSE) 方式逐 chunk 推送生成内容，而非等待完整生成后一次性返回。

## ⚙️ 深入原理

### 非流式 vs 流式

- **非流式**（`stream: false`，默认）：客户端发送请求后阻塞等待，模型生成完毕后返回完整的 `ChatCompletion` 对象。延迟 = 完整生成时间。
- **流式**（`stream: true`）：模型每生成一小段文本就立即推送一个 chunk，客户端逐个接收并处理。首字延迟（TTFT）大幅降低。

### SSE (Server-Sent Events)

SSE 是一种基于 HTTP 长连接的服务端推送协议。在流式模式下：

1. 客户端发送普通 HTTP 请求（带 `stream: true` 参数）。
2. 服务端响应的 `Content-Type` 为 `text/event-stream`，保持连接不断开。
3. 模型每生成一段 token，服务端发送一个 `data:` 前缀的事件，内容是一个 JSON 对象（`ChatCompletionChunk`）。
4. 连接关闭或 `[DONE]` 标记表示流结束。

### chunk 数据结构

每个 chunk 的核心字段：

```typescript
{
  choices: [{
    index: 0,
    delta: { content: "生成的文本片段" },  // 增量内容
    finish_reason: null                       // 中间 chunk 为 null
  }]
}
```

- **`delta`**（增量）：只包含本次 chunk 新增的内容，与完整响应中的 `message` 不同。
- **`finish_reason`**：中间 chunk 为 `null`，最后一个 chunk 为 `"stop"`（自然结束）或 `"length"`（被截断）。
- **`delta.content`** 可能为 `undefined`：最后一个 chunk 可能只携带 `finish_reason`，无文本内容。

### 拼接完整回复

流式响应不直接提供完整文本，需要手动拼接：

```typescript
let fullContent = '';
for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content ?? '';
  fullContent += content;
}
```

### usage 字段

流式响应通常**不包含** `usage` 字段（token 消耗统计）。部分模型厂商在最后一个 chunk 中返回，但这不是标准行为。如需统计 token，可在流结束后单独发一次非流式请求，或使用厂商提供的其他接口。

## 🛠️ 在 Agent 架构中的作用

- **用户体验**：流式输出的核心价值是降低首字延迟（TTFT），用户无需等待完整生成即可看到输出。在 Agent 场景中，长推理链路尤其需要流式。
- **超时容错**：非流式请求可能因生成时间过长触发网关超时；流式模式下连接持续有数据传输，不易被中间层判定为超时断开。
- **早期决策**：Agent 可在流式输出过程中检测特定标记（如工具调用名称），提前触发后续逻辑，而不必等待完整生成。

## 🔗 相关代码落地

- [Stage 1 · Step 3 - 流式输出的艺术](../stages/stage-01/step-03.md)

## 🧩 关联概念

- [Chat Completion API](./chat-completion-api.md)（流式是该 API 的一种响应模式）
- [Token 与上下文窗口](../generation-control/token-and-context-window.md)（流式不影响 token 计费逻辑）

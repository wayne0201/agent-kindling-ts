---
title: 流式 Function Calling
date: 2026-06-19
stage: 2
step: 4
tags: [function-calling, streaming, sse]
status: done
related_demo: ../../demos/stage-02/step-04/stream-function-calling.ts
---

# Step 4: 流式 Function Calling

## 🎯 本环节目标

在流式模式下正确处理 `tool_calls` 的增量拼接，理解流式与非流式 Function Calling 的差异。

## 💡 核心原理速记

- **流式 tool_calls 的差异**：非流式模式下 `tool_calls` 一次性返回完整数据；流式模式下 `function.arguments` 被拆成多个 chunk 的 `delta`，需按 `index` 聚合并手动拼接。
- **拼接规则**：同一个 `tool_call` 的 `id` 和 `function.name` 只在第一个 chunk 出现，`function.arguments` 跨多个 chunk 增量追加。用 `index` 字段区分不同的 tool_call。
- **流结束 = tool_calls 一定完整**：API 保证一次流式响应中的所有 tool_calls 不会跨流拆分。`for await` 循环退出时，arguments 一定已拼接完整，可以安全 `JSON.parse()`。
- **多工具并发调用**：模型可能同时调用多个工具（如"北京和上海天气"），每个工具的 arguments 独立拼接，通过 `index` 区分。

## 💻 落地内容与代码

**代码实现**: [demos/stage-02/step-04/stream-function-calling.ts](../../demos/stage-02/step-04/stream-function-calling.ts)

**核心逻辑简述**:
1. `createToolCallAccumulator()` 创建拼接器，内部用 `Map<index, StreamingToolCall>` 聚合。
2. 遍历流式 chunk，对每个 `delta.tool_calls` 调用 `accumulate()` 追加 arguments 片段。
3. 流结束后调用 `getResults()` 获取拼接完整的 tool_calls——此时 JSON 一定完整。
4. 构造 assistant 消息（含完整 `tool_calls`）追加到 messages，执行工具并回传。
5. 用工具结果发起新的流式请求，获取最终回复。

**代码亮点**:
- 拼接器封装为独立函数，职责清晰，可复用。
- 按 `index` 聚合而非 `id`，因为第一个 chunk 可能还没有 `id`。
- tool_calls chunk 间加延时，让你直观观察碎片拼接过程；文本 chunk 不加延时，保持正常流式体验。

## 🔄 两次 API 调用模式

流式 Function Calling 的完整流程涉及**两次独立的流式 API 调用**：

```
第一次 API 调用（流式）
  模型输出: "让我查一下天气..." → tool_calls
  ↑ 文字逐字显示              ↑ 流结束，arguments 完整
                              │
                    ┌─────────┴──────────┐
                    │ 本地执行工具         │  ← "正在查询天气..."
                    │ get_weather("北京")  │
                    │ get_weather("上海")  │
                    └─────────┬──────────┘
                              │ 拿到结果
                              ▼
第二次 API 调用（流式）  ← 全新的流，从头逐字输出
  模型输出: "北京28°C晴，上海32°C多云..."
```

- 第一次流返回 tool_calls → 流结束 → 本地执行工具 → 把结果塞回 messages
- 第二次流是**全新的请求**，文字从头逐字输出，不存在"攒一大段"的问题
- 用户感知到的"暂停"发生在两次流之间，即工具执行期间

## 🧠 相关知识点沉淀

- [Function Calling](../../concepts/api-fundamentals/function-calling.md) — 流式模式下的 tool_calls 处理
- [流式输出与 SSE](../../concepts/api-fundamentals/streaming-and-sse.md) — 流式基础原理

## 🐞 踩坑记录与思考

- **不能在流式过程中 `JSON.parse(arguments)`**：arguments 是不完整的 JSON 片段（如 `{"city":"北`），必须等流结束。
- **必须按 `index` 而非到达顺序聚合**：多工具调用时，不同工具的 arguments chunk 可能交错到达。
- **流式对 tool_calls 的价值不是"提前执行"**：工具必须等 arguments 拼完才能执行。流式的价值是**更早知道模型要干什么**——第一个 chunk 到达时就能拿到 `function.name`，可以立刻给用户反馈（如"正在调用 get_weather..."）。
- **分层反馈策略**：收到 `function.name` → 显示"正在调用 xxx..."；后续 chunks → 参数逐步"打字"；流结束 → 真正执行工具。这是 ChatGPT 网页端"Searching the web..."动画的原理。

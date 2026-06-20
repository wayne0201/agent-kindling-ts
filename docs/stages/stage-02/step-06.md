---
title: 交付物 —— 天气+新闻 Agent
date: 2026-06-19
stage: 2
step: 6
tags: [function-calling, agent, deliverable]
status: done
related_demo: ../../demos/stage-02/step-06/weather-news-agent.ts
---

# Step 6: 交付物 —— 天气+新闻 Agent

## 🎯 本环节目标

整合前五步能力，交付一个实用的工具调用 Agent。用户可以查天气、搜新闻，Agent 自主判断何时调用工具，工具结果自然融入对话。

## 💡 核心原理速记

- **System Prompt 约束行为边界**：通过 system 消息定义 Agent 的能力范围、行为准则、输出规范，确保 Agent 不会在不该调用工具时调用。
- **Agent 核心循环**：用户输入 → 模型决策（调用工具 or 回复）→ 执行工具 → 回传结果 → 模型再决策 → 直到回复文本。这是所有 Agent 的基础骨架。
- **流式 + accumulator 模式**：用 Step 4 学过的流式 tool_calls 拼接器，一次流式请求同时处理 tool_calls 拼接和文本打字机效果，无需额外 API 调用。
- **工具结果自然语言化**：工具返回的是 JSON，模型负责将其转化为用户友好的自然语言。客户端不做格式化，让模型"说话"。

## 💻 落地内容与代码

**代码实现**: [demos/stage-02/step-06/weather-news-agent.ts](../../demos/stage-02/step-06/weather-news-agent.ts)

**核心逻辑简述**:
1. **System Prompt**：定义 Agent 身份（生活助手）、能力（查天气、搜新闻）、行为准则（何时调用工具、如何回复）。
2. **两个工具**：
   - `get_weather`：查询城市天气（温度、天气状况、湿度、风力），模拟真实 API 响应结构。
   - `search_news`：按关键词和分类搜索新闻，返回标题、摘要、来源、发布时间。
3. **流式 Agent 循环**：`processTurn()` 内 while 循环处理工具调用链。每次迭代用流式请求，文本 delta 直接输出（打字机效果），tool_calls delta 用 accumulator 拼接。流结束后判断：有 tool_calls 则执行工具继续循环，无 tool_calls 则结束本轮。
4. **会话统计**：记录对话轮数、工具调用次数、上下文消息数。

**代码亮点**:
- System Prompt 明确了 6 条行为准则，包括"纯闲聊不调用工具""工具返回错误时解释原因"等边界约束。
- 流式 + accumulator 模式：一次 API 请求同时获得打字机效果和完整 tool_calls，比"先非流式再流式"的双重请求更高效。
- 工具调用时有 `🔧` 日志提示，让用户感知 Agent 的行动过程。

## 🧠 相关知识点沉淀

- [Function Calling](../../concepts/api-fundamentals/function-calling.md) — Agent 核心循环
- [System Prompt 与结构化输出](../../concepts/api-fundamentals/system-prompt-and-structured-output.md) — 行为边界约束
- [多轮对话与上下文管理](../../concepts/api-fundamentals/multi-turn-context.md) — 多轮对话基础
- [流式输出与 SSE](../../concepts/api-fundamentals/streaming-and-sse.md) — 流式 accumulator 模式

## 🐞 踩坑记录与思考

- **注意**: 流式模式下，文本和 tool_calls 可能在同一次流中返回。accumulator 拼接 tool_calls 的同时，文本 delta 可以直接输出——两者互不干扰。
- **注意**: System Prompt 中"纯闲聊不调用工具"这条准则很重要。没有它，模型可能对"今天天气真好"这类感叹也调用 `get_weather`。
- **思考**: 这个 Agent 已经具备了 Agent 的三个核心要素——感知（用户输入）、决策（模型选择工具）、行动（执行工具）。Stage 3 会在此基础上加入"思考"环节，让 Agent 能处理更复杂的多步任务。

---
title: 交互式工具调用 Agent
date: 2026-06-19
stage: 2
step: 5
tags: [function-calling, interactive, agent-loop]
status: done
related_demo: ../../demos/stage-02/step-05/interactive-tool-agent.ts
---

# Step 5: 交互式工具调用 Agent

## 🎯 本环节目标

将 Stage 1 的多轮对话循环与 Function Calling 结合，实现一个交互式 Agent——用户在终端自然对话，Agent 自主判断是否调用工具，工具结果自然融入回复。

## 💡 核心原理速记

- **Agent 的核心循环**：用户输入 → 模型决策（回复文本 or 调用工具）→ 如果调用工具则执行并回传 → 模型再次决策 → 直到返回文本。
- **分支处理**：每轮模型响应有两种可能——① 直接回复文本（`tool_calls` 为空）→ 输出并结束本轮；② 调用工具（`tool_calls` 非空）→ 执行工具 → 回传结果 → 再次请求模型。
- **工具调用循环**：模型可能在一轮对话中连续调用多个工具（先查天气再查时间），需要 while 循环持续处理，直到模型返回纯文本。
- **防无限循环**：设置 `maxIterations` 上限，防止模型陷入"调用工具 → 再调用工具"的死循环。

## 💻 落地内容与代码

**代码实现**: [demos/stage-02/step-05/interactive-tool-agent.ts](../../demos/stage-02/step-05/interactive-tool-agent.ts)

**核心逻辑简述**:
1. 复用 Stage 1 Step 5 的多轮对话框架（readline + messages 数组 + 会话统计）。
2. `processTurn()` 处理一轮对话，内部 while 循环处理工具调用链。
3. 每次模型响应先检查 `tool_calls`：有则执行工具并回传，无则输出文本结束本轮。
4. 工具调用时有日志提示（`🔧 调用工具: get_weather(...)`），让用户感知 Agent 的行动。

**代码亮点**:
- `processTurn()` 内部的 while 循环是 Agent 内核的雏形——Stage 3 的 Harness Loop 由此演化。
- `maxIterations` 防护，避免模型无限调用工具。
- 会话统计包含工具调用次数，量化 Agent 的"行动量"。

**与 Step 6 的区别**：本步使用非流式请求，逻辑更简单直观，适合理解 Agent 循环的核心结构。Step 6 在此基础上加入流式输出，提供打字机效果。

## 🧠 相关知识点沉淀

- [Function Calling](../../concepts/api-fundamentals/function-calling.md) — 工具调用循环
- [多轮对话与上下文管理](../../concepts/api-fundamentals/multi-turn-context.md) — 多轮对话基础

## 🐞 踩坑记录与思考

- **注意**: 模型的 assistant 消息（含 `tool_calls`）必须追加到 messages，即使它没有文本内容。API 要求 tool 消息前必须有对应的 assistant 消息。
- **注意**: 工具调用循环中，每次请求都要带上完整的 messages（含之前的工具调用和结果），模型需要这些上下文来决定下一步。
- **思考**: 这个 while 循环就是 Agent 的"心脏"——观察（模型输出）→ 行动（执行工具）→ 观察（模型再输出）→ ... 直到行动结束（返回文本）。Stage 3 会在此基础上加入"思考"环节，演化为 ReAct 模式。

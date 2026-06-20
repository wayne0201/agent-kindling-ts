---
title: Function Calling 初体验
date: 2026-06-19
stage: 2
step: 1
tags: [function-calling, tool-use, basics]
status: done
related_demo: ../../demos/stage-02/step-01/function-calling-basics.ts
---

# Step 1: Function Calling 初体验

## 🎯 本环节目标

理解 Function Calling 的四步流程：① 客户端注册工具 → ② 模型决定调用并返回 `tool_calls` → ③ 客户端执行工具 → ④ 将结果以 `role: "tool"` 回传模型。用一个 `get_weather` 模拟工具跑通完整流程。

## 💡 核心原理速记

- **Function Calling 四步流程**：客户端在请求中通过 `tools` 参数注册可用工具；模型根据用户意图决定是否调用，返回 `tool_calls`；客户端解析参数、执行函数；将结果以 `role: "tool"` + `tool_call_id` 回传，模型基于结果生成最终回复。详见 [Function Calling](../../concepts/api-fundamentals/function-calling.md)。
- **模型不执行工具**：模型只输出"我想调用什么函数、传什么参数"的意图，真正的执行由客户端完成。这是安全设计。
- **`tool_calls` 结构**：`id`（调用标识）+ `function.name` + `function.arguments`（JSON 字符串，需 `JSON.parse()`）。
- **`role: "tool"` 消息**：必须携带 `tool_call_id`，与 `tool_calls` 中的 `id` 严格对应，模型据此关联调用与结果。

## 💻 落地内容与代码

**代码实现**: [demos/stage-02/step-01/function-calling-basics.ts](../../demos/stage-02/step-01/function-calling-basics.ts)

**核心逻辑简述**:
1. 定义 `get_weather` 工具（含 `name`、`description`、`parameters` JSON Schema）。
2. 模拟天气数据，实现 `getWeather()` 函数。
3. 发送请求时传入 `tools` 参数，检查 `finish_reason` 和 `tool_calls`。
4. 解析 `arguments`，通过 `toolMap` 映射执行对应函数。
5. 将结果以 `role: "tool"` 追加到 `messages`，再次请求获取最终回复。

**代码亮点**:
- `toolMap` 映射表：工具名 → 执行函数，为后续多工具扩展预留结构。
- 完整的四步流程日志输出，每步都有清晰标注。
- 模型未调用工具时的降级处理（直接输出回复）。

## 🧠 相关知识点沉淀

- [Function Calling](../../concepts/api-fundamentals/function-calling.md) — 本环节新增的核心概念
- [消息角色 (role)](../../concepts/api-fundamentals/message-roles.md)（`role: "tool"` 是 Function Calling 新增的角色）
- [Chat Completion API](../../concepts/api-fundamentals/chat-completion-api.md)（Function Calling 是该 API 的扩展能力）

## 🐞 踩坑记录与思考

- **注意**: `tool_calls[0].function.arguments` 是 JSON **字符串**，不是对象，必须 `JSON.parse()` 才能使用。这是新手最常犯的错误。
- **注意**: `role: "tool"` 消息必须携带 `tool_call_id`，否则 API 会报错。`tool_call_id` 必须与 `tool_calls` 中的 `id` 严格对应。
- **注意**: 模型的 assistant 消息（含 `tool_calls`）也必须追加到 `messages`，不能跳过。API 要求消息序列中 assistant 的 `tool_calls` 与后续的 `tool` 消息一一对应。
- **注意**: 模型返回 `tool_calls` 时，`finish_reason` 的值是 `"stop"` 而非 `"tool_calls"`。这违反直觉——Stage 1 的经验让我们习惯"`stop` = 对话结束"，但在 Function Calling 场景中 `stop` 只表示"模型此轮推理结束，决定调工具"，真正的对话还没完成。**判断对话是否结束的正确方式是检查 `message.tool_calls` 是否存在**，不能仅依赖 `finish_reason`。
- **思考**: 模型"不执行工具"这个设计是刻意为之的安全机制——如果模型能直接执行代码，Prompt 注入攻击就能让模型执行任意命令。客户端作为执行层，拥有完全的控制权。

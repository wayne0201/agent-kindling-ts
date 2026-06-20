---
title: Function Calling
phase: 1
stage: 2
tags: [function-calling, tool-use, agent]
status: done
---

# Stage 2 · Phase 1 筑基期 —— 解锁 Function Calling

> 从"只会说话"到"能动手"——让模型调用你的函数，是 Agent 从聊天机器人走向自主行动的关键一步。

## 🎯 阶段目标

在 Stage 1 掌握 API 基础与上下文管理的基础上，解锁 Chat Completion API 的 **Function Calling** 能力。理解模型如何决定调用哪个工具、如何传递参数，以及客户端如何执行工具并将结果回传模型。最终交付一个带工具调用的 Agent（能查天气、搜新闻）。

- 理解 Function Calling 的请求-响应-执行-回传四步流程。
- 掌握 `tools` 参数的结构定义（`type: "function"` + `function: { name, description, parameters }`）。
- 理解模型输出 `tool_calls` 的结构，以及 `role: "tool"` 消息的回传机制。
- 处理多工具选择、参数校验、工具执行异常等工程问题。
- 落地一个能自主选择并调用工具的 Agent。

## 📋 环节清单

| 环节 | 主题 | 验收标准 | 代码 / 文档 |
|------|------|----------|-------------|
| **Step 1** ✅ | Function Calling 初体验 | 模型正确选择工具并返回 `tool_calls`，代码成功执行并回传结果 | [code](../../demos/stage-02/step-01/function-calling-basics.ts) · [doc](./step-01.md) |
| **Step 2** ✅ | 多工具注册与选择 | 注册 3+ 个工具，模型能根据用户意图选择正确的工具 | [code](../../demos/stage-02/step-02) · [doc](./step-02.md) |
| **Step 3** ✅ | 工具参数校验与异常处理 | 模型返回非法参数时代码不崩溃，有明确错误回传 | [code](../../demos/stage-02/step-03/tool-error-handling.ts) · [doc](./step-03.md) |
| **Step 4** ✅ | 流式 Function Calling | 流式模式下正确处理 `tool_calls` 的增量拼接 | [code](../../demos/stage-02/step-04/stream-function-calling.ts) · [doc](./step-04.md) |
| **Step 5** ✅ | 交互式工具调用 Agent | 用户在终端对话，Agent 自主判断是否调用工具 | [code](../../demos/stage-02/step-05/interactive-tool-agent.ts) · [doc](./step-05.md) |
| **Step 6** ✅ | 交付物 —— 天气+新闻 Agent | Agent 能查天气、搜新闻，工具结果自然融入对话 | [code](../../demos/stage-02/step-06/weather-news-agent.ts) · [doc](./step-06.md) |

> ✅ 全部环节已实现。阶段总结见 [stage-end.md](./stage-end.md)。

## 📝 各环节要点速览

### Step 1：Function Calling 初体验
- **学习**：理解 Function Calling 的四步流程——① 客户端注册工具 → ② 模型决定调用并返回 `tool_calls` → ③ 客户端执行工具 → ④ 将结果以 `role: "tool"` 回传模型。
- **任务**：定义一个 `get_weather` 工具（模拟实现），让模型在用户问天气时主动调用，代码执行后回传结果。
- **验收**：终端输出完整的四步流程日志，模型基于工具结果生成自然语言回复。

### Step 2：多工具注册与选择
- **学习**：`tools` 数组可注册多个工具，模型根据 `description` 和用户意图自主选择。理解 `tool_choice` 参数（`auto` / `required` / `none` / 指定工具）。
- **任务**：注册 `get_weather`、`get_time`、`calculate` 三个工具，测试模型在不同问题下的选择准确性。
- **验收**：问天气调天气工具，问时间调时间工具，问数学调计算工具，选择准确率 > 90%。

### Step 3：工具参数校验与异常处理
- **学习**：模型生成的参数不一定合法（类型错误、缺字段、值越界）。客户端必须校验，异常时将错误信息以 `role: "tool"` 回传，让模型自行修正。
- **任务**：给 `calculate` 工具加参数校验，故意构造模型可能出错的场景（如除零），观察模型收到错误后的自我修正。
- **验收**：非法参数不导致程序崩溃，模型能基于错误信息重试或道歉。

### Step 4：流式 Function Calling
- **学习**：流式模式下 `tool_calls` 的 `delta` 结构与非流式不同——`function.arguments` 是增量拼接的 JSON 字符串，需手动拼接完整后再 `JSON.parse()`。
- **任务**：改造 Step 1 代码，使用 `stream: true` 调用，正确拼接流式 `tool_calls` 参数。
- **验收**：流式模式下工具参数拼接完整，无截断无丢失。

### Step 5：交互式工具调用 Agent
- **学习**：将 Stage 1 的多轮对话循环与 Function Calling 结合——每轮模型可能选择回复文本或调用工具，客户端需分支处理。
- **任务**：基于 Stage 1 Step 5 的 `multi-turn-chat.ts`，加入工具调用逻辑。模型返回 `tool_calls` 时自动执行并回传，用户无感知。
- **验收**：用户在终端自然对话，Agent 自主判断何时调用工具，工具结果自然融入回复。

### Step 6：交付物 —— 天气+新闻 Agent
- **目标**：整合前五步能力，交付一个实用的工具调用 Agent。
- **任务**：模拟天气和新闻 API，实现 `get_weather` 和 `search_news` 两个工具。加入 System Prompt 约束 Agent 行为边界。
- **验收**：用户问"北京今天天气如何"能返回真实天气，问"最近有什么科技新闻"能返回真实新闻，纯闲聊时不调用工具。

---

← 返回 [项目总览](../../README.md)

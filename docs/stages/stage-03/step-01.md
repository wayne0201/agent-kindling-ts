---
title: 从 while 循环到 Harness Loop
date: 2026-06-20
stage: 3
step: 1
tags: [harness-loop, agent-core, state-machine]
status: in-progress
related_demo: ../../demos/stage-03/step-01/harness-loop.ts
---

# Step 1: 从 while 循环到 Harness Loop

## 🎯 本环节目标

把 Stage 2 `processTurn()` 里那个"会跑但说不清"的 while 循环，重构为**显式的、状态驱动的 Harness Loop**。引入 `AgentState` 类型、step 计数器、三种终止条件，让 Agent 的执行过程从"隐式循环"变成"可观测的状态机"。

## 💡 核心原理速记

- **Harness Loop 的本质**：`状态 → LLM 决策 → 解析 → 执行 → 观察回写 → 更新状态` 的循环，直到满足终止条件。它不是新东西，而是对 Stage 2 工具调用循环的"命名与显式化"。
- **为什么叫 Harness**：Harness 原意"挽具"——套在马身上的控制装置。Agent 的内核就是套在 LLM 外层的控制装置：LLM 只负责"想"，Harness 负责"跑循环、执行、收集观察、决定何时停"。
- **三种终止条件**：`done`（模型返回纯文本，任务完成）/ `max_steps`（超过步数上限，防死循环）/ `error`（不可恢复异常）。
- **状态显式化的价值**：Stage 2 的循环能跑，但你无法回答"Agent 现在在第几步？为什么停了？"。显式状态让执行过程可观测、可调试、可中断——这是 Stage 10 可观测性的基础。
- **我们不设计流程，我们只提供容器**：Harness Loop 里的"下一步做什么"不是开发者预先写好的 `if/else`，而是 LLM 每步实时推理出来的。可能 1 步就 `done`（闲聊），可能 3 步 `done`（多工具调用+推理），也可能 8 步都没 `done`（`max_steps`）。开发者只控制三件事：执行 LLM 决定的工具调用、把结果回传让 LLM 决定下一步、判断是否该停。这是 Agent 编程与传统编程的本质区别——传统程序的流程是写死的，Agent 的流程是 LLM 跑出来的。

## 💻 落地内容与代码

**代码实现**: [demos/stage-03/step-01/harness-loop.ts](../../demos/stage-03/step-01/harness-loop.ts)

**核心逻辑简述**:
1. 定义 `AgentState` 类型（`running` / `done` / `max_steps` / `error`）与 `HarnessStep` 记录结构。
2. 抽象出 `runHarness(task)` 函数：内部 while 循环，每轮打印 `[Step N]` 状态流转日志。
3. 仍复用 Stage 2 的模拟工具（`get_weather` / `calculate`），聚焦循环骨架本身。
4. 每轮检查终止条件：模型返回纯文本 → `done`；超过 `MAX_STEPS` → `max_steps`；异常 → `error`。

**代码亮点**:
- `runHarness()` 是一个**与具体工具无关**的通用循环——后续 step 只需换工具集，循环骨架不变。
- 每步产出结构化 `HarnessStep` 记录，循环结束后打印完整轨迹，让"Agent 做了什么"一目了然。
- `MAX_STEPS` 防护 + try/catch 兜底，保证循环一定终止。

## 🧠 相关知识点沉淀

- [Harness Loop](../../concepts/agent-core/harness-loop.md) — 本环节的核心概念，状态驱动的 Agent 执行内核
- [Function Calling](../../concepts/api-fundamentals/function-calling.md) — Harness Loop 的"执行"环节依赖工具调用
- [多轮对话与上下文管理](../../concepts/api-fundamentals/multi-turn-context.md) — Harness Loop 的状态本质是 messages 数组

## 🐞 踩坑记录与思考

- **注意**: 终止条件不能只看 `finish_reason`。Stage 2 踩过的坑依然成立——`finish_reason: "stop"` 在工具调用场景下只表示"模型此轮推理结束"，不等于"任务完成"。判断任务完成的唯一可靠信号是**模型返回纯文本且无 `tool_calls`**。
- **注意**: `MAX_STEPS` 必须设置。模型可能陷入"调用工具 → 再调用工具"的循环（如反复查同一个城市的天气），没有上限会无限消耗 token。
- **思考**: Stage 2 的 `processTurn()` 其实就是一个 Harness Loop，只是没有命名。给模式命名、把隐式逻辑显式化，是从"能跑"到"能维护"的关键一步——这也是为什么框架（LangGraph 等）都把 Loop 作为一等公民。

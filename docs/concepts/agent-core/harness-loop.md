---
concept: Harness Loop
tags: [agent-core, state-machine, core-mechanism]
last_updated: 2026-06-22
---

# 概念：Harness Loop

## 📖 一句话定义

Harness Loop 是套在 LLM 外层的控制装置（Harness = 挽具）：LLM 只负责"想"，Harness 负责"跑循环、执行工具、收集结果、判断何时停"——本质是把 Stage 2 那个"能跑但说不清"的 while 循环，重构为显式的、状态驱动的执行内核。

## ⚙️ 深入原理

### 一个循环的骨架

```
┌──────────────────────────────────────────────────┐
│               🔄 Harness Loop                    │
│                                                  │
│   ┌────────┐     ┌────────┐     ┌────────┐      │
│   │ 当前    │ ──→ │  LLM   │ ──→ │ 解析    │     │
│   │ 状态    │     │ 决策   │     │ 执行    │      │
│   │ State  │ ←── │        │ ←── │ 工具   │      │
│   └───┬────┘     └────────┘     └────────┘      │
│       │                                      │    │
│       ▼                                      │    │
│   done / max_steps / error ──→ 终止         │    │
└──────────────────────────────────────────────────┘
```

每一步的工作：
1. **状态 → LLM 决策**：把当前 messages 数组发给模型，模型返回 `content`（思考/回复）和 `tool_calls`（行动意图）。
2. **解析 → 执行**：如果模型返回 `tool_calls`，客户端解析参数、执行对应工具函数。
3. **观察回写 → 更新状态**：把工具结果以 `role: "tool"` 追加回 messages，进入下一轮；如果没有 `tool_calls`，任务完成。

### 三种终止条件

| 状态 | 触发条件 | 含义 |
|------|---------|------|
| `done` | 模型返回纯文本，无 `tool_calls` | 任务完成 |
| `max_steps` | 超过步数上限（如 `MAX_STEPS = 8`） | 防死循环，模型可能陷入反复调用同一工具 |
| `error` | 不可恢复异常（如 LLM 请求失败） | 异常终止 |

**关键认知**：判断 `done` 的可靠依据是**检查 `tool_calls` 是否为空**，而不是 `finish_reason`。`finish_reason: "stop"` 在工具调用场景下只表示"模型此轮推理结束"，不等于"任务完成"。

### 我们不设计流程，我们只提供容器

Harness Loop 里的"下一步做什么"不是开发者预先写好的 `if/else`，而是 **LLM 每步实时推理出来的**。可能 1 步就 `done`（闲聊），可能 3 步 `done`（多工具调用+推理），也可能 8 步都没 `done`（`max_steps`）。

开发者只控制三件事：
1. **执行** LLM 决定的工具调用
2. **把结果回传** 给 LLM，让它决定下一步
3. **判断是否该停**

这是 Agent 编程与传统编程的本质区别——传统程序的流程是写死的，Agent 的流程是 LLM 跑出来的。

### 状态显式化的价值

Stage 2 的 while 循环能跑，但你无法回答"Agent 现在在第几步？为什么停了？"。Harness Loop 引入两个结构：

- **AgentState**：给循环的每种终止方式一个名字（`running` / `done` / `max_steps` / `error`）。一看就知道 Agent 停在哪、为什么停。
- **HarnessStep 记录**：每步的结构化记录（第几步、想了什么、调了什么工具、结果是什么），循环结束后聚合为完整轨迹，支持事后回溯、日志、调试。

## 🛠️ 在 Agent 架构中的作用

- **Agent 的执行引擎**：所有后续能力（ReAct 推理、文件工具、脚本执行、上下文截断）都挂在这个循环骨架之上。换工具集只需改 `tools` 和 `toolMap`，`runHarness()` 函数骨架不变。
- **可观测性的基础**：状态显式化 + 轨迹记录让执行过程可观测、可调试、可中断——这是后续阶段（日志系统、监控、回溯分析）的认知前提。
- **防死循环的工程保障**：`MAX_STEPS` 上限防止模型陷入"调用工具 → 再调用工具"的无限循环，避免无限消耗 token。

## 🔗 相关代码落地

- [Stage 3 · Step 1 - 从 while 循环到 Harness Loop](../stages/stage-03/step-01.md)

## 🧩 关联概念

- [Function Calling](../api-fundamentals/function-calling.md) —— Harness Loop "执行"环节的实现机制
- [多轮对话与上下文管理](../api-fundamentals/multi-turn-context.md) —— Harness Loop 的状态本质是 messages 数组
- [ReAct 推理模式](./react.md) —— 在 Harness Loop 骨架上引入"先思考再行动"的行为模式

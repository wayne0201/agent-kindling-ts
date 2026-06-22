---
title: ReAct 推理模式
date: 2026-06-20
stage: 3
step: 2
tags: [react, reasoning, prompt-engineering]
status: in-progress
related_demo: ../../demos/stage-03/step-02/react-agent.ts
---

# Step 2: ReAct 推理模式

## 🎯 本环节目标

在 Step 1 的 Harness Loop 骨架上引入 **ReAct（Reasoning + Acting）** 模式——让 Agent 在"行动"前先"思考"。面对需要条件判断的复杂任务，Agent 能先拆解、再行动、基于观察调整，而不是像 Stage 2 那样"单步反射"。

## 💡 核心原理速记

- **ReAct 三段式**：`Thought`（思考：我该做什么、为什么）→ `Action`（行动：调用工具）→ `Observation`（观察：工具返回的结果）。多轮循环直到 `Thought` 得出"任务完成，可以回复用户"。
- **为什么需要思考环节**：Stage 2 的 Agent 是"反射式"的——用户问天气就直接调天气工具。但面对"先查北京天气，如果下雨再查上海天气"这类条件任务，反射式 Agent 会一次性把两个城市的天气都查了，忽略条件。ReAct 让 Agent 先思考"我需要先查北京，看结果再决定是否查上海"。
- **实现方式**：用 System Prompt 约束模型在每次输出前先给出 `Thought`，再给出 `Action`（工具调用）。Function Calling 的 `tool_calls` 天然对应 `Action`，`Thought` 通过引导模型在 `content` 中输出思考文本实现。
- **ReAct ≠ Function Calling**：Function Calling 是"行动"的机制，ReAct 是"思考+行动"的模式。ReAct 可以用 Function Calling 实现 Action，也可以用纯文本解析实现（早期 ReAct 论文就是纯文本）。
- **命名来源与灵活性**：`Thought / Action / Observation` 来自 2022 年论文 [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)，是社区约定俗成的命名。但它**不是 API 层面的规范**，没有强制约束。你可以用"思考/行动/观察"或任何自定义措辞，模型不在乎关键词本身，它在乎的是 prompt 里有没有描述"先分析再行动"的行为逻辑。用主流命名的好处仅是社区可读性和现成模板的复用性。
- **ReAct 依赖两个条件，缺一不可**：Prompt（提示词工程）决定模型"会不会先想"，Harness Loop（软件工程，Step 1 搭的循环骨架）决定模型"能不能想多轮"。没有 Loop，ReAct 只能走一步就停——模型输出了 Thought 和 Action，但没有机制让它看到 Observation 后再输出下一个 Thought。所以 ReAct 不只是"写好提示词就行"，它是一个**上层策略（Prompt）+ 下层基础设施（Loop）**的组合。
- **ReAct 的目标不是减少步数，而是让决策更合理**：简单任务上 ReAct 可能比反射式走更多步（多了一步 Thought 输出），但在条件性任务上，反射式可能盲目行动（如一次性查两个城市天气，忽略条件逻辑），ReAct 则基于观察动态决策。步数多少不是衡量标准，决策是否基于观察才是。

## 💻 落地内容与代码

**代码实现**: [demos/stage-03/step-02/react-agent.ts](../../demos/stage-03/step-02/react-agent.ts)

**核心逻辑简述**:
1. System Prompt 明确要求模型按 ReAct 模式工作：先输出 `Thought: ...`，再决定是否调用工具。
2. Harness Loop 每轮把模型的 `content`（Thought）和 `tool_calls`（Action）都打印出来，让推理过程可见。
3. 设计条件任务用例："先查北京天气，如果是晴天就查上海天气，否则告诉我北京天气即可"——观察 ReAct 如何基于第一次观察决定下一步。
4. 对比实验：用同样的任务跑"无 ReAct 约束"的 Stage 2 式 Agent，看它是否会盲目调用两次工具。

**代码亮点**:
- System Prompt 用明确的 ReAct 指令模板，约束模型"先思考再行动"。
- 每步日志区分 `💭 Thought` 与 `🔧 Action`，让推理链路可视化。
- 条件任务用例直击 ReAct 的价值——基于观察的动态决策。

## 🧠 相关知识点沉淀

- [ReAct 推理模式](../../concepts/agent-core/react.md) — 本环节的核心概念，Reasoning + Acting
- [Harness Loop](../../concepts/agent-core/harness-loop.md) — ReAct 依赖 Loop 提供多轮思考能力
- [Function Calling](../../concepts/api-fundamentals/function-calling.md) — ReAct 的 Action 环节实现机制
- [System Prompt 与结构化输出](../../concepts/api-fundamentals/system-prompt-and-structured-output.md) — ReAct 靠 System Prompt 约束输出结构

## 🐞 踩坑记录与思考

- **注意**: ReAct 的"思考"不是免费的——模型输出 Thought 会消耗 token，且增加一轮延迟。简单任务用反射式更快更省，复杂任务才值得用 ReAct。这是 Stage 6 路由（闲聊 vs 复杂任务）的伏笔。
- **注意**: 模型不一定严格遵守 ReAct 格式，有时会跳过 Thought 直接调工具。System Prompt 要明确"必须先输出 Thought"，但仍需容错——没有 Thought 时不报错，只是日志里少一段。
- **思考**: ReAct 的本质是把"推理"从模型的黑盒里拉到可见的文本中。这不仅让 Agent 更可靠，也让调试成为可能——你能看到 Agent "想错了"在哪一步。这是 Stage 10 可观测性的认知基础。

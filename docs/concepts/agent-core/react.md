---
concept: ReAct 推理模式
tags: [agent-core, reasoning, prompt-engineering, core-mechanism]
last_updated: 2026-06-22
---

# 概念：ReAct 推理模式

## 📖 一句话定义

ReAct = Reasoning + Acting，让 Agent 在"行动"前先"思考"：通过 System Prompt 约束模型按 `Thought → Action → Observation` 三段式输出，使决策基于观察而非盲目反射。

## ⚙️ 深入原理

### 反射式 vs ReAct

面对条件任务"查北京天气，如果是晴天就再查上海天气"：

- **反射式（Stage 2 风格）**：看到问题直接行动，可能一次性调用 `get_weather("北京")` + `get_weather("上海")`——还没看到北京结果就盲查上海，逻辑错了。
- **ReAct**：先思考拆解，调一次看一次，基于观察决定下一步：

```
Thought: 用户要北京天气，且条件性要上海。我先查北京，看结果再决定。
Action:  get_weather("北京")
Observation: {"temp":"28°C","condition":"晴"}
Thought: 北京是晴天，不需要查上海。可以直接回复用户。
最终回复: 北京今天 28°C 晴天，没有下雨...
```

### 依赖两个条件，缺一不可

ReAct 能生效，需要**上层策略 + 下层基础设施**同时具备：

| 条件 | 角色 | 缺了会怎样 |
|------|------|-----------|
| **Prompt（提示词工程）** | 告诉模型"怎么想"——约束输出 `Thought → Action` 格式 | 模型直接行动，不会先思考 |
| **Harness Loop（软件工程）** | 让模型"能想多轮"——提供观察→再推理的循环能力 | ReAct 只能走一步就停，看不到 Observation 后的下一个 Thought |

所以 ReAct **不只是"写好提示词就行"**。Prompt 让模型"会先想"，Loop 让模型"能想多轮"。

### 命名来源与灵活性

`Thought / Action / Observation` 来自 2022 年论文 [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629)，是社区约定俗成的命名。

但它**不是 API 层面的规范**，没有强制约束。你可以用"思考/行动/观察"或任何自定义措辞——模型不在乎关键词本身，它在乎的是 prompt 里有没有描述"先分析再行动"这个行为逻辑。用主流命名的好处仅是社区可读性和现成模板的复用性。

### ReAct ≠ 减少步数

常见误解：ReAct 让 Agent 走更少步。实际上恰恰相反——ReAct 可能**走更多步**（每步多一段 Thought 输出，消耗额外 token 和延迟）。它的价值不在于"快"，而在于**决策基于观察**：面对条件性、多步骤的复杂任务时，Agent 不会盲目行动。衡量标准是"决策是否合理"，不是"步数多少"。

### ReAct ≠ Function Calling

- **Function Calling** 是"行动"的机制（API 层面的 `tool_calls`）。
- **ReAct** 是"思考+行动"的模式（Prompt 层面的行为约束）。
- ReAct 用 Function Calling 实现 Action，但 Action 也可以用纯文本解析实现（早期 ReAct 论文就是纯文本）。

## 🛠️ 在 Agent 架构中的作用

- **复杂任务的决策质量**：反射式 Agent 适合简单任务（查个天气、算个数）；ReAct 让 Agent 能处理需要条件判断、动态规划的复杂任务（先查 A，看结果决定是否查 B）。
- **推理过程可观测**：ReAct 把"推理"从模型的黑盒里拉到可见的文本中。这不仅让 Agent 更可靠，也让调试成为可能——你能看到 Agent "想错了"在哪一步。这是后续可观测性的认知基础。
- **简单任务才值得用 ReAct 的反向原则**：ReAct 的代价是多一轮思考输出（token + 延迟），简单任务用反射式更快更省。这是后续路由设计（闲聊 vs 复杂任务）的伏笔。

## 🔗 相关代码落地

- [Stage 3 · Step 2 - ReAct 推理模式](../stages/stage-03/step-02.md)

## 🧩 关联概念

- [Harness Loop](./harness-loop.md) —— ReAct 依赖 Loop 提供多轮思考能力
- [System Prompt 与结构化输出](../api-fundamentals/system-prompt-and-structured-output.md) —— ReAct 靠 System Prompt 约束输出结构
- [Function Calling](../api-fundamentals/function-calling.md) —— ReAct 的 Action 环节实现机制

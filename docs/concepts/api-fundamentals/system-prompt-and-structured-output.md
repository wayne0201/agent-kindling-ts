---
concept: System Prompt 与结构化输出
tags: [api-basics, prompt-engineering, structured-output]
last_updated: 2026-06-19
---

# 概念：System Prompt 与结构化输出

## 📖 一句话定义

System Prompt 通过 `role: "system"` 消息设定模型的人格与行为边界；结构化输出则是在 System Prompt 中用格式约束（XML/JSON）要求模型按指定格式返回结果，使输出可被代码程序化解析。

## ⚙️ 深入原理

### System Prompt

Chat Completion API 的 `messages` 数组中，`role: "system"` 的消息具有特殊地位：

- **全局生效**：放在消息列表首位，对整个会话的模型行为持续生效。
- **权重最高**：当 user 消息与 system 指令冲突时，模型倾向于遵循 system 指令。
- **核心用途**：人格设定（"你是XX专家"）、行为约束（"只回答XX领域"）、输出格式约束（"用XML格式输出"）。

```typescript
messages: [
  { role: 'system', content: '你是一位毒舌代码审查员。严格按XML格式输出。' },
  { role: 'user', content: '审查这段代码：...' },
]
```

### 结构化输出

让模型输出可被程序化解析的结构化内容，有两种主流方式：

#### XML 结构化

在 System Prompt 中要求模型用 XML 标签包裹不同语义部分：

```
<评价>代码过于简单，缺乏类型检查</评价>
<修改建议>添加参数类型注解和返回值类型</修改建议>
```

代码端用正则或 XML 解析器提取：

```typescript
const ratingMatch = content.match(/<评价>([\s\S]*?)<\/评价>/);
```

**优点**：标签的开闭结构天然提示模型"填空"，遵从率较高；容错性好——即使模型多输出了说明文字，正则仍能提取标签内内容。

#### JSON 结构化

要求模型直接返回 JSON 对象：

```json
{"language": "TypeScript", "complexity": "低", "issues": ["无类型注解"], "suggestion": "添加类型"}
```

**注意**：模型可能用 markdown 代码块包裹（` ```json ... ``` `），需先剥离再 `JSON.parse()`。

**缺点**：JSON 的括号/逗号语法严格，模型容易漏逗号或多括号导致解析失败，遵从率低于 XML。

### 格式遵从率

模型并非 100% 遵守格式约束。影响遵从率的因素：

- **格式复杂度**：简单格式 > 复杂嵌套格式。
- **模型能力**：大模型 > 小模型。
- **Prompt 精确度**：明确示例 + 强调"不要输出其他内容" > 模糊指令。

生产环境的应对策略：
1. **容错解析**：try/catch + 降级（如重试或用正则兜底提取）。
2. **强约束特性**：使用厂商提供的 Structured Outputs / JSON Mode，在 API 层面强制格式（后续阶段探索）。

## 🛠️ 在 Agent 架构中的作用

- **工具调用前提**：Function Calling 的参数解析依赖结构化输出（JSON 格式的函数参数）。
- **推理链路**：ReAct 模式中，Agent 需要从模型输出中提取"思考"和"行动"字段，结构化输出是基础。
- **多步编排**：Skills（技能编排）中，上游步骤的输出是下游步骤的输入，结构化保证链路可解析。

## 🔗 相关代码落地

- [Stage 1 · Step 4 - System Prompt 与结构化输出](../stages/stage-01/step-04.md)
- [Stage 3 · Step 2 - ReAct 推理模式](../stages/stage-03/step-02.md)（用 System Prompt 约束"先思考再行动"的行为模式）

## 🧩 关联概念

- [Chat Completion API](./chat-completion-api.md)（System Prompt 是该 API 的 `role: system` 消息）
- [流式输出与 SSE](./streaming-and-sse.md)（结构化输出与流式可结合使用）

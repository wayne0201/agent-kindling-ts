---
concept: 消息角色 (role)
tags: [api-basics, core-mechanism]
last_updated: 2026-06-19
---

# 概念：消息角色 (role)

## 📖 一句话定义

Chat Completion API 的 `messages` 数组中，每条消息通过 `role` 字段标识其身份——`system`（系统指令）、`user`（用户输入）、`assistant`（模型回复）、`tool`（工具返回），角色决定了模型如何理解和处理该消息。

## ⚙️ 深入原理

### 四种角色

| role | 含义 | 由谁产生 | 用途 |
|------|------|----------|------|
| `system` | 系统指令 | 开发者 | 设定模型的人格、行为边界、输出规范 |
| `user` | 用户输入 | 终端用户 | 提问或下达任务 |
| `assistant` | 模型回复 | 模型 | 记录模型的历史回答，实现多轮上下文 |
| `tool` | 工具返回 | 外部工具 | Function Calling 中工具调用的结果 |

### 角色间的协作关系

一个完整的多轮对话消息流：

```typescript
messages: [
  { role: 'system',    content: '你是编程导师。' },
  { role: 'user',      content: '什么是闭包？' },
  { role: 'assistant', content: '闭包是指...' },        // 第1轮模型回复
  { role: 'user',      content: '能举个例子吗？' },      // 第2轮追问
  { role: 'assistant', content: '比如...' },            // 第2轮模型回复
]
```

### 关键认知

- **system 管"怎么答"，user 管"答什么"**：system 不是"更强的 user"，而是不同维度的控制。system 设定行为规范，user 提供具体任务。
- **assistant 和 tool 是历史记录，不是指令**：客户端把它们放回 `messages`，是为了让模型"记住"之前的对话。API 本身是无状态的，多轮记忆的本质是重发历史。
- **system 通常放首位**：对整个会话生效，权重高于 user 消息。当 user 消息与 system 指令冲突时，模型倾向于遵循 system。
- **tool 在 Function Calling 中使用**：模型调用工具后，客户端将工具执行结果以 `role: 'tool'` 消息追加到 `messages`，再次请求让模型基于工具结果继续推理。

### 消息流向

```
开发者 ──system──→ messages ──→ 模型
用户   ──user────→ messages ──→ 模型
模型   ──assistant→ messages ──→ (重发) ──→ 模型
工具   ──tool────→ messages ──→ (重发) ──→ 模型
```

## 🛠️ 在 Agent 架构中的作用

- **System Prompt 是 Agent 的"宪法"**：定义 Agent 的能力边界、行为规范和输出格式，是 Agent 稳定运行的基础。
- **assistant 消息构成上下文记忆**：Agent 的 Harness Loop 每轮都将历史 assistant 回复追加到 messages，实现"有状态"对话。
- **tool 消息实现工具调用闭环**：Agent 调用工具后，将结果以 tool 角色回传，模型基于结果继续推理或生成最终回复。

## 🔗 相关代码落地

- [Stage 1 · Step 1 - 环境破冰与第一次调用](../stages/stage-01/step-01.md)（system + user 消息的基本用法）
- [Stage 1 · Step 4 - System Prompt 与结构化输出](../stages/stage-01/step-04.md)（system 角色的人格设定与格式约束）

## 🧩 关联概念

- [Chat Completion API](./chat-completion-api.md)（role 是该 API 消息结构的核心字段）
- [System Prompt 与结构化输出](./system-prompt-and-structured-output.md)（system 角色的深度应用）

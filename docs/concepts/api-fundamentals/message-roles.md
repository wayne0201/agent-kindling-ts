---
concept: 消息角色 (role)
tags: [api-basics, core-mechanism]
last_updated: 2026-06-20
---

# 概念：消息角色 (role)

## 📖 一句话定义

Chat Completion API 的 `messages` 数组中，每条消息通过 `role` 字段标识身份——模型根据 role 理解"这句话是谁说的、该怎么对待它"。

## ⚙️ 深入原理

### 四种角色速览

| role | 谁写入 messages | 模型如何看待它 | 典型场景 |
|------|----------------|---------------|----------|
| `system` | 开发者（代码硬编码） | **最高优先级的全局指令**，整个会话生效 | 设定人格、行为规范、输出格式 |
| `user` | 终端用户（或代码模拟） | **具体任务和提问**，驱动模型生成内容 | 提问、下达指令、提供待处理的数据 |
| `assistant` | 模型自身（上轮回复） | **历史记录**，让模型"记住"之前说过什么 | 多轮对话的上下文记忆 |
| `tool` | 客户端代码（工具执行后） | **工具返回的事实数据**，模型据此继续推理 | Function Calling 的结果回传 |

### system — 全局行为规范

```typescript
{ role: 'system', content: '你是一位严谨的编程导师，只回答技术问题，拒绝闲聊。' }
```

- 设定模型的**人格**（你是什么）、**边界**（你不做什么）和**输出规范**（你按什么格式回答）。
- 通常放在 `messages` 列表的**首位**，对整个会话生效。
- **不是"更强的 user"**——它是不同维度的控制。user 管"答什么"，system 管"怎么答"。
- 当 user 消息与 system 指令冲突时，模型倾向于遵循 system。但如果 system 过长或指令过多，模型可能"遗忘"靠后的规则（系统提示的优先级衰减效应）。

### user — 具体任务输入

```typescript
{ role: 'user', content: '什么是闭包？用 TypeScript 举个例子。' }
```

- 模型的**主要驱动信号**——每条 user 消息都触发一次新的模型推理。
- 不限于纯文本：也可以传入图片（Vision 模型）、结构化数据（JSON/XML）、文档片段等。
- 在 Agent 场景中，user 消息经常由代码构造（如把工具执行结果包装成 user 消息），而非真实用户手动输入。

### assistant — 模型的历史回复

```typescript
{ role: 'assistant', content: '闭包是指一个函数能够访问其定义时所在作用域的变量...' }
```

- **不是指令，而是历史记录**——客户端把模型上轮的回复追加到 messages，让模型"记住"上下文。
- API 本身是无状态的，"多轮记忆"的本质就是把之前的 assistant 回复（和对应的 user 消息）重新发给模型。
- 必须和对应的 user 消息成对出现，否则模型会困惑。

### tool — 工具调用的结果回传

```typescript
{
  role: 'tool',
  content: '{"city":"北京","temp":"28°C","condition":"晴"}',
  tool_call_id: 'call_abc123',  // 必填，与 tool_calls 中的 id 严格对应
}
```

- **Function Calling 专属角色**，只在工具调用流程中使用。
- 由客户端代码写入（执行完工具后，把结果塞进 messages）。
- **必须携带 `tool_call_id`**，否则 API 报错。这个 id 是模型在 `tool_calls` 中生成的，用于关联"哪次调用"与"哪个结果"。
- 模型收到 tool 消息后，会基于工具返回的数据继续推理，生成最终的自然语言回复或发起新的工具调用。

### 完整的多轮对话消息流

一个不含工具的普通多轮对话：

```
system    ──→ "你是编程导师。"
user      ──→ "什么是闭包？"
assistant ←── "闭包是指..."          （第 1 轮）
user      ──→ "能举个例子吗？"
assistant ←── "比如..."              （第 2 轮）
```

一个含工具的 Function Calling 流程：

```
system    ──→ "你是助手，可以查天气。"
user      ──→ "北京天气怎么样？"
assistant ←── tool_calls: [get_weather({city:"北京"})]
tool      ──→ {"temp":"28°C","condition":"晴"}   ← 客户端执行工具后回传
assistant ←── "北京今天 28°C，晴天。"             （基于工具结果的最终回复）
```

## 🛠️ 在 Agent 架构中的作用

- **System Prompt 是 Agent 的"宪法"**：定义 Agent 的能力边界、行为规范和输出格式，是 Agent 稳定运行的基础。
- **user/assistant 构成上下文记忆**：Agent 的 Harness Loop 每轮都将历史消息追加到 messages，实现"有状态"对话。随着对话增长，需要滑动窗口截断来控制上下文长度。
- **tool 消息实现工具调用闭环**：Agent 调用工具后，将结果以 tool 角色回传，模型基于结果继续推理或生成最终回复。这是 Function Calling 四步流程的最后一步。

## 🔗 相关代码落地

- [Stage 1 · Step 1 - 环境破冰与第一次调用](../../stages/stage-01/step-01.md)（system + user + assistant 的基本用法）
- [Stage 1 · Step 4 - System Prompt 与结构化输出](../../stages/stage-01/step-04.md)（system 角色的人格设定与格式约束）
- [Stage 2 · Step 1 - Function Calling 基础](../../stages/stage-02/step-01.md)（tool 角色的完整流程）

## 🧩 关联概念

- [Chat Completion API](./chat-completion-api.md)（role 是该 API 消息结构的核心字段）
- [Function Calling](./function-calling.md)（tool 角色在 Function Calling 四步流程中的位置）

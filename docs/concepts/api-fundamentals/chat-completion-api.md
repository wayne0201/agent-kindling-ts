---
concept: Chat Completion API
tags: [api-basics, core-mechanism]
last_updated: 2026-06-19
---

# 概念：Chat Completion API

## 📖 一句话定义

大模型最基础的交互接口：客户端发送一个由多条消息组成的 `messages` 数组，模型返回一条 `assistant` 回复。

## ⚙️ 深入原理

Chat Completion API 的核心数据结构是 **`messages` 列表**。每个元素是一个对象，包含两个关键字段：

- **`role`**：消息的角色，决定模型如何理解这条消息的权重和语境。
  - `system`：系统指令，设定模型的人格、行为边界和输出规范。通常放在列表首位，对整个会话生效。
  - `user`：用户输入，即"人问的问题"。
  - `assistant`：模型的历史回复。在多轮对话中，把之前的 `assistant` 消息也放进列表，模型就能"记住"上下文。
  - `tool`：工具调用的返回结果（Function Calling 阶段涉及）。
- **`content`**：消息的文本内容。

一次典型的请求结构：

```typescript
{
  model: 'glm-4.6',
  messages: [
    { role: 'system', content: '你是一位编程导师。' },
    { role: 'user', content: '什么是 AI Agent？' },
  ],
}
```

模型返回的响应中，最关键的字段是 `choices[0].message.content`（模型的文本回复）和 `usage`（token 消耗统计）。

**关键认知：大模型是无状态的。** API 本身不保存对话历史——每次请求都是独立的。所谓的"多轮对话记忆"，本质是把历史消息连同新输入一起重新发送给模型（见 [Step 5](../stages/stage-01/stage.md)）。

## 🛠️ 在 Agent 架构中的作用

Chat Completion API 是 Agent 与 LLM 通信的**底层通道**。Agent 的核心循环——Harness Loop（状态 → LLM → 解析 → 执行）——每一步"→ LM"都通过这个接口完成。理解它的输入输出结构，是构建 Function Calling、ReAct 推理、多轮上下文管理等一切高级能力的前提。

## 🔗 相关代码落地

- [Stage 1 · Step 1 - 环境破冰与第一次调用](../stages/stage-01/step-01.md)

## 🧩 关联概念

- [消息角色 (role)](./message-roles.md)
- [OpenAI 兼容协议](./openai-compatible-protocol.md)
- [流式输出与 SSE](./streaming-and-sse.md)

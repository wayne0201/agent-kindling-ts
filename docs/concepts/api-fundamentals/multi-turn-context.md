---
concept: 多轮对话与上下文管理
tags: [api-basics, core-mechanism, context-management]
last_updated: 2026-06-19
---

# 概念：多轮对话与上下文管理

## 📖 一句话定义

LLM API 是**无状态**的——它不保存对话历史。多轮对话的"记忆"是客户端通过每轮重发完整 `messages` 历史来实现的：把模型的 `assistant` 回复追加回数组，下次请求一并发送。

## ⚙️ 深入原理

### 为什么 LLM "失忆"？

Chat Completion API 的每次请求都是**独立、无状态的**。模型只看当前收到的 `messages` 数组，不知道上一轮说了什么。不把历史放回去，模型就从零开始。

对比：

```
❌ 无记忆（每轮只发当前问题）:
  第1轮 messages: [system, user: "我叫小明"]
  第2轮 messages: [system, user: "我叫什么？"]  ← 模型不知道"我"是谁

✅ 有记忆（每轮追加历史）:
  第1轮 messages: [system, user: "我叫小明", assistant: "你好小明！"]
  第2轮 messages: [system, user: "我叫小明", assistant: "你好小明！", user: "我叫什么？"]
                  ↑ 整段历史重新发送，模型能看到前面的对话
```

### 消息数组的生命周期

每一轮对话，`messages` 数组的增长路径：

```
初始         [system]                                    ← 设定角色
第1轮请求 →  [system, user₁]                             ← 发送
第1轮回复 ←  [system, user₁, assistant₁]                 ← 追加回复
第2轮请求 →  [system, user₁, assistant₁, user₂]           ← 完整发送
第2轮回复 ←  [system, user₁, assistant₁, user₂, assistant₂] ← 追加回复
...以此类推
```

四个角色在数组中的流向：

```
system    ── 静态 ──→ 始终位于首位，不增不减
user      ── 每轮追加 ──→ 终端用户输入
assistant ── 每轮追加 ──→ 模型回复（客户端 push 回去）
tool      ── 按需追加 ──→ Function Calling 时的工具调用结果
```

### 上下文窗口：记忆的硬上限

`messages` 数组不能无限增长。每个模型有**上下文窗口**（context window）——单次请求能处理的最大 token 数。当累计 token 超出窗口上限：

- API 返回 `context_length_exceeded` 错误
- 或模型厂商自动截断最早的消息（不可控，可能丢失关键信息）

应对策略（Step 6 及后续阶段涉及）：
- **滑动窗口截断**：只保留最近 N 条消息或最近 N 个 token
- **摘要压缩**：定期将历史对话压缩为一段摘要，替代原始消息
- **向量检索记忆**：把历史存入向量数据库，按相关性检索（Stage 4 RAG 涉及）

### Agent 场景下的上下文膨胀特点

在普通聊天场景中，每轮只增加 1 条 `user` + 1 条 `assistant` 消息，增长较平稳。但在 Agent 的 Harness Loop 中，每步可能产生多组 `assistant`（含 `tool_calls`）+ `tool`（工具返回结果）消息对，尤其是**脚本执行工具返回大段 stdout/stderr** 时，上下文膨胀速度远超普通聊天。这是 Stage 3 Step 5 引入滑动窗口截断的直接原因——不做截断，Agent 跑 20+ 步后 token 很容易撑爆上下文窗口。

## 🛠️ 在 Agent 架构中的作用

- **Harness Loop 的记忆基础**：Agent 的核心循环（观察 → 思考 → 行动）每一步都要把历史 `assistant` + `tool` 消息发回模型。这是在 Step 5 的基础上扩展：不只是 `user` ↔ `assistant` 的聊天，还加入了 `tool` 调用与结果。
- **为持久化记忆铺路**：当前的 `messages` 数组是内存中的——进程重启即丢失。Step 6 将引入文件系统持久化（`chat_history.json`），让记忆跨进程存活。
- **成本意识的起点**：每轮重发历史 = 每轮为历史 token 付费。理解这一点是后续做上下文压缩、缓存策略的认知前提。

## 🔗 相关代码落地

- [Stage 1 · Step 5 - 上下文管理](../stages/stage-01/step-05.md)（本概念的实战验证）
- [Stage 1 · Step 1 - 环境破冰与第一次调用](../stages/stage-01/step-01.md)（messages 数组的基本结构）
- [Stage 3 · Step 5 - 滑动窗口上下文截断](../stages/stage-03/step-05.md)（Agent 场景下的上下文膨胀治理）

## 🧩 关联概念

- [消息角色 (role)](./message-roles.md) —— `messages` 数组中四种角色的含义与协作
- [Chat Completion API](./chat-completion-api.md) —— messages 是 API 的核心输入结构
- [Token 与上下文窗口](../generation-control/token-and-context-window.md) —— 上下文膨胀的量化理解

---
title: 上下文管理 —— 多轮对话基础
date: 2026-06-19
stage: 1
step: 5
tags: [api-basics, context-management, stateless]
status: done
related_demo: ../../demos/stage-01/step-05/multi-turn-chat.ts
---

# Step 5: 上下文管理 —— 多轮对话基础

## 🎯 本环节目标

理解大模型 API 的**无状态特性**，通过手动维护 `messages` 数组实现"多轮对话记忆"——每次请求将完整历史连同新输入一起发送，让模型"记住"之前说了什么。

## 💡 核心原理速记

- **LLM 是无状态的**：API 不保存任何对话历史。每次请求都是独立的，模型只看当前收到的 `messages` 数组。所谓的"记忆"，本质是客户端把历史 `user` + `assistant` 消息连同新问题一起重新发给模型。详见 [多轮对话与上下文管理](../../concepts/api-fundamentals/multi-turn-context.md)。
- **messages 数组就是"记忆载体"**：每轮对话后，把模型的 `assistant` 回复 push 回 `messages`，下一轮请求时数组包含完整历史，模型就能理解上下文（如代词指代）。
- **上下文窗口是有限资源**：`messages` 每轮都会膨胀，当累积 token 超过模型的上下文窗口上限时，最早的对话会被截断或请求失败。详见 [Token 与上下文窗口](../../concepts/generation-control/token-and-context-window.md)。
- **流式模式下 token 统计不可靠**：流式响应的 chunk 通常不携带 `usage` 字段，需通过 `stream_options: { include_usage: true }` 显式请求，且取决于模型厂商是否支持。

## 💻 落地内容与代码

**代码实现**: [demos/stage-01/step-05/multi-turn-chat.ts](../../demos/stage-01/step-05/multi-turn-chat.ts)

**核心逻辑简述**:
1. 初始化 `messages` 数组（含 System Prompt 设定角色），声明 `roundCount`、token 累计器等会话状态。
2. 使用 `node:readline/promises` 创建交互界面，`while(true)` 循环等待用户输入。
3. 用户输入非空时，追加 `{ role: 'user', content: input }` 到 `messages`。
4. 以 `stream: true` 调用 API，传入**完整** `messages` 数组——这是上下文生效的关键。
5. 遍历流式 chunk，用 `process.stdout.write()` 逐字打印打字机效果，同时拼接完整回复。
6. 流结束后，将 `{ role: 'assistant', content: fullContent }` push 回 `messages`——完成记忆写入。
7. 支持 `/exit` 命令退出，同时捕获 `SIGINT`（Ctrl+C）优雅退出，打印会话摘要。

**代码亮点**:
- `stream_options: { include_usage: true }` 尝试在流式模式下获取 token 统计，累积到全局计数器，让用户直观感受上下文膨胀。
- `try/catch` 包裹单轮请求：API 异常时移除未成功的 user 消息，保持 `messages` 数组干净，不中断循环。
- 退出时打印"最终上下文长度"（`messages.length`），展示多轮对话后数组的增长——可视化"记忆"的代价。

## 🧠 相关知识点沉淀

- [多轮对话与上下文管理](../../concepts/api-fundamentals/multi-turn-context.md) — 本环节新增的核心概念
- [消息角色 (role)](../../concepts/api-fundamentals/message-roles.md)
- [Chat Completion API](../../concepts/api-fundamentals/chat-completion-api.md)
- [Token 与上下文窗口](../../concepts/generation-control/token-and-context-window.md)

## 🐞 踩坑记录与思考

- **问题**: 流式模式下 `usage` 字段为 `undefined`。
  - **解决**: 传入 `stream_options: { include_usage: true }` 后，部分模型在最后一个 chunk 返回 `usage`。需注意这是非标准行为，不同厂商支持情况各异。
- **观察**: 随着对话轮数增加，`prompt_tokens` 每轮显著增长（因为 `messages` 数组越来越长）。
  - **思考**: 这就是"上下文膨胀"——每次请求都要为历史对话买单。生产环境中必须做历史截断（滑动窗口），这正是 Step 6 要解决的问题。
- **观察**: `messages` 数组中同时存在多轮 `user` 和 `assistant` 消息后，模型对代词指代（"它"、"那个"）的理解显著提升。
  - **思考**: 这验证了"记忆的本质是重发历史"——模型没有魔法，一切都是数据。

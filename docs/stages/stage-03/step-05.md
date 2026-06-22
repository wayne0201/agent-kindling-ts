---
title: 滑动窗口上下文截断
date: 2026-06-20
stage: 3
step: 5
tags: [context-window, sliding-window, token-management]
status: in-progress
related_demo: ../../demos/stage-03/step-05/context-window.ts
---

# Step 5: 滑动窗口上下文截断

## 🎯 本环节目标

落地 README 辅助措施中"从 Stage 3 起强制实现历史对话滑动窗口截断"的要求。实现 token 估算与滑动窗口截断，让 Agent 在长任务（多轮工具调用）中不因上下文爆炸而失败。

## 💡 核心原理速记

- **为什么 Stage 3 才需要截断**：Stage 1/2 的对话每轮只增加两条消息（user + assistant），膨胀慢。Stage 3 的自主编码 Agent 每轮工具调用会增加 3 条消息（assistant 含 tool_calls + tool 结果 + 下一轮 assistant），且 `run_script` 的 stdout 动辄上千字符。20 轮下来上下文轻松破万 token。
- **Token 估算**：精确 token 数需要 tokenizer（如 `tiktoken`），但引入额外依赖。本步用"字符数 ÷ 4"近似（中英文混合场景的经验值），够用且零依赖。生产环境可换 `tiktoken`。
- **滑动窗口策略**：永远保留 ① `system` 消息（Agent 人格不能丢）② 最近 N 条消息（短期记忆）③ 丢弃中间历史。注意：**不能丢弃 `tool` 消息而不丢弃其对应的 `assistant(tool_calls)` 消息**——API 要求 tool 消息前必须有对应的 assistant tool_calls，否则报错。
- **截断时机**：在 Harness Loop 每轮调用 LLM 前截断，而非每轮都截断——只有当估算 token 超过阈值（如 6000）时才触发，避免无谓的消息操作。

## 💻 落地内容与代码

**代码实现**: [demos/stage-03/step-05/context-window.ts](../../demos/stage-03/step-05/context-window.ts)

**核心逻辑简述**:
1. 实现 `estimateTokens(messages)`：遍历消息，`JSON.stringify` 后按字符数 ÷ 4 估算。
2. 实现 `truncateMessages(messages, maxTokens, keepRecent)`：保留 system + 最近 `keepRecent` 条，中间历史丢弃。处理 tool_calls/tool 消息的成对保留问题。
3. 在 Harness Loop 每轮请求前调用：若 `estimateTokens > THRESHOLD` 则截断，打印截断日志（丢弃了多少条、节省了多少 token）。
4. 模拟长任务：让 Agent 连续执行 20+ 次 `calculate` 工具调用，观察上下文增长与截断生效。

**代码亮点**:
- `truncateMessages` 处理了 tool_calls 与 tool 消息的成对约束——从前往后扫描，遇到孤立的 tool 消息（其对应 assistant 已被丢弃）则一并丢弃。
- 截断是"惰性触发"——未超阈值时不操作，避免每轮开销。
- 截断后打印 `✂️ 上下文截断` 日志，让截断行为可观测。

## 🧠 相关知识点沉淀

- [Token 与上下文窗口](../../concepts/generation-control/token-and-context-window.md) — 截断的理论基础
- [多轮对话与上下文管理](../../concepts/api-fundamentals/multi-turn-context.md) — 上下文膨胀的来源

## 🐞 踩坑记录与思考

- **注意**: 截断时不能简单"保留前 N 条 + 后 M 条"。OpenAI 兼容 API 要求：每条 `role: "tool"` 消息前必须有对应的 `role: "assistant"` 且含相同 `tool_call_id` 的 `tool_calls`。截断若打破这个配对，API 直接报 400。处理方式：截断后扫描，丢弃孤立的 tool 消息。
- **注意**: `system` 消息必须永远保留——它定义 Agent 人格与行为边界，丢了 Agent 就"失忆"了。截断逻辑要把它排除在窗口外。
- **思考**: 滑动窗口是最简单的上下文管理策略，缺点是"丢掉中间就忘了"。Stage 4 的 RAG 和 Stage 5 的长期记忆是更高级的方案——把重要信息检索回来，而非简单丢弃。但滑动窗口是所有方案的地基。

---
concept: Token 与上下文窗口
tags: [core-mechanism, cost-control]
last_updated: 2026-06-19
---

# 概念：Token 与上下文窗口

## 📖 一句话定义

Token 是大模型处理文本的最小单位（约 2/3 个英文单词或 1 个汉字），上下文窗口是模型单次能处理的输入+输出 token 总上限——这是记忆容量与成本的双重边界。

## ⚙️ 深入原理

### Token
模型不直接读字符，而是把文本切分成 token。中英文的切分粒度不同：
- 英文：约 1 token ≈ 0.75 个单词（"hamburger" 可能是 1 个或多个 token）。
- 中文：通常 1 个汉字 ≈ 1~2 token，取决于分词器。

API 响应中的 `usage` 字段统计三类 token：
- `prompt_tokens`：输入侧消耗。
- `completion_tokens`：输出侧消耗。
- 计费通常按两者之和（输出单价往往高于输入）。

### 上下文窗口（Context Window）
模型单次请求能处理的**输入 + 输出** token 总上限。例如 128K 窗口意味着 `messages 总长 + max_tokens ≤ 128K`。

关键认知：
- 窗口是"工作记忆"，不是"持久记忆"。每次请求独立，模型不跨请求记事——所谓多轮记忆，是把历史消息重发进窗口（见 [Chat Completion API](./chat-completion-api.md)）。
- 对话变长后，历史消息会撑爆窗口，必须做**滑动窗口截断**（Stage 3 起强制实现）。
- `max_tokens` 占用的是输出侧预算，与输入共享窗口总额：输入越长，留给输出的空间越少。

## 🛠️ 在 Agent 架构中的作用

- **成本控制**：token 直接计费，监控 `usage` 是成本管理的基础。Stage 1 Step 1 已开始打印 token 消耗。
- **记忆管理**：Agent 的长程记忆不能全塞进窗口，需要滑动窗口截断 + 摘要压缩 + 外部存储（RAG）分层管理。
- **截断容错**：`max_tokens` 过小导致输出被 `length` 截断时，JSON 可能不闭合、工具调用参数可能残缺——生产环境必须检查 `finish_reason` 并处理续写。

## 🔗 相关代码落地

- [Stage 1 · Step 1 - 环境破冰与第一次调用](../stages/stage-01/step-01.md)（首次打印 token 消耗）
- [Stage 1 · Step 2 - 掌控核心参数](../stages/stage-01/step-02.md)（max_tokens 截断实验）
- [Stage 3 · Step 5 - 滑动窗口上下文截断](../stages/stage-03/step-05.md)（token 估算与滑动窗口截断落地）

## 🧩 关联概念

- [Chat Completion API](../api-fundamentals/chat-completion-api.md)
- [生成参数 temperature / top_p / max_tokens](./generation-parameters.md)

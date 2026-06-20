---
title: 多工具注册与选择
date: 2026-06-19
stage: 2
step: 2
tags: [function-calling, multi-tool, tool-choice]
status: done
related_demo: ../../demos/stage-02/step-02
---

# Step 2: 多工具注册与选择

## 🎯 本环节目标

注册 3 个工具（`get_weather`、`get_time`、`calculate`），观察模型如何根据用户意图自主选择正确的工具。理解 `tool_choice` 参数的四种模式。

## 💡 核心原理速记

- **多工具注册**：`tools` 数组可包含多个工具定义，模型根据每个工具的 `description` 和用户意图自主匹配。
- **`tool_choice` 参数**：
  - `"auto"`（默认）：模型自主决定是否调用工具
  - `"required"`：强制模型至少调用一个工具
  - `"none"`：禁止模型调用工具
  - `{"type": "function", "function": {"name": "xxx"}}`：强制调用指定工具
- **description 是选择依据**：模型不读你的代码，只读 `description`。描述越精准，选择越准确。
- **纯闲聊不调工具**：`tool_choice: "auto"` 时，模型对"你好"这类闲聊不会调用工具，直接回复文本。

## 💻 落地内容与代码

**代码实现**:
- [demos/stage-02/step-02/tool-selection.ts](../../demos/stage-02/step-02/tool-selection.ts) — Case 1: 工具选择准确性测试
- [demos/stage-02/step-02/tool-choice-param.ts](../../demos/stage-02/step-02/tool-choice-param.ts) — Case 2: tool_choice 参数对比
- [demos/stage-02/step-02/_shared.ts](../../demos/stage-02/step-02/_shared.ts) — 共享基础设施（工具定义、实现、chatWithTools）

**核心逻辑简述**:
1. `_shared.ts` 定义三个工具（`get_weather`、`get_time`、`calculate`）及 `chatWithTools()` 函数，返回结构化的 `ChatTrace` 记录。
2. `tool-selection.ts`（Case 1）：用 4 个测试用例（天气、时间、计算、闲聊）验证模型选择准确性。
3. `tool-choice-param.ts`（Case 2）：对同一条闲聊消息分别用 `auto` / `none` / `required` 三种 `tool_choice`，观察差异。

**代码亮点**:
- `calculate` 工具用正则过滤非法字符，防止代码注入（`Function` 构造器的安全防护）。
- `toolMap` 映射表统一管理工具执行，新增工具只需加一行映射。

## 🧠 相关知识点沉淀

- [Function Calling](../../concepts/api-fundamentals/function-calling.md) — `tool_choice` 参数详解

## 🐞 踩坑记录与思考

- **注意**: `tool_choice: "required"` 对纯闲聊消息会强制模型调用工具，可能产生不合理的调用（如对"你好"调用 `get_time`）。这说明 `required` 只在明确需要工具时使用。
- **注意**: `tool_choice: "none"` 时模型不会返回 `tool_calls`，即使问题明显需要工具。这是硬性禁用。
- **思考**: 工具的 `description` 质量直接决定选择准确率。如果两个工具描述模糊，模型容易选错。写 description 要像写 API 文档一样严谨。

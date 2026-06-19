---
title: System Prompt 与结构化输出
date: 2026-06-19
stage: 1
step: 4
tags: [api-basics, system-prompt, structured-output]
status: done
related_demo: ../../demos/stage-01/step-04/structured-output.ts
---

# Step 4: System Prompt 与结构化输出

## 🎯 本环节目标

掌握 System Prompt 的人格设定能力，利用 XML 或 JSON 标签约束模型输出格式，并用代码解析提取结构化字段。

## 💡 核心原理速记

- **System Prompt**：`messages` 数组中 `role: "system"` 的消息，设定模型的人格、行为边界和输出规范。它对整个会话生效，权重高于 user 消息，是控制模型行为的核心手段。
- **XML 结构化输出**：在 System Prompt 中要求模型用 XML 标签包裹不同部分（如 `<评价>...</评价><修改建议>...</修改建议>`），代码端用正则或 XML 解析器提取。
- **JSON 结构化输出**：要求模型直接返回 JSON 对象，代码端用 `JSON.parse()` 解析。需注意模型可能用 markdown 代码块包裹（` ```json ... ``` `），需先剥离再解析。
- **格式遵从率**：模型并非 100% 遵守格式约束，尤其是小模型或复杂格式。生产环境需要容错处理（try/catch + 降级策略），或使用 OpenAI 的 Structured Outputs / JSON Mode 等强约束特性。

## 💻 落地内容与代码

**代码实现**: [demos/stage-01/step-04/structured-output.ts](../../demos/stage-01/step-04/structured-output.ts)

**核心逻辑简述**:
1. 实验 1（XML）：设定「毒舌审查员」System Prompt，要求输出 `<评价>` 和 `<修改建议>` 标签，用正则提取。
2. 实验 2（JSON）：要求模型返回 JSON 对象，用 `JSON.parse()` 解析，兼容 markdown 代码块包裹。

**代码亮点**:
- XML 提取用非贪婪正则 `([\s\S]*?)`，支持标签内多行内容。
- JSON 解析兼容 markdown 代码块包裹（模型常见行为），先剥离再 parse。
- `try/catch` 包裹 JSON 解析，处理模型格式不遵从的情况。

## 🧠 相关知识点沉淀

- [System Prompt 与结构化输出](../../concepts/api-fundamentals/system-prompt-and-structured-output.md)
- [Chat Completion API](../../concepts/api-fundamentals/chat-completion-api.md)（System Prompt 是 `messages` 中 `role: system` 的消息）

## 🐞 踩坑记录与思考

- **注意**: 模型不一定 100% 遵守格式约束。JSON 解析失败是常见问题，生产环境必须有容错处理。
- **注意**: 模型返回 JSON 时可能用 ` ```json ... ``` ` 包裹，需先剥离 markdown 标记再 `JSON.parse()`。
- **思考**: System Prompt 的「约束力」来自预训练和指令微调，不是硬性保证。如需强约束，应使用厂商提供的 Structured Outputs / JSON Mode 等特性（在后续阶段探索）。
- **思考**: XML 格式比 JSON 更容易让模型遵从——标签的开闭结构天然提示模型"填空"，而 JSON 的括号/逗号语法更容易出错。

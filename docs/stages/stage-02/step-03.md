---
title: 工具参数校验与异常处理
date: 2026-06-19
stage: 2
step: 3
tags: [function-calling, error-handling, validation]
status: done
related_demo: ../../demos/stage-02/step-03/tool-error-handling.ts
---

# Step 3: 工具参数校验与异常处理

## 🎯 本环节目标

给工具函数加参数校验，故意构造模型可能出错的场景（除零、不存在的城市），观察模型收到错误后的自我修正能力。

## 💡 核心原理速记

- **模型参数不一定合法**：模型可能返回类型错误、缺字段、值越界的参数，客户端必须校验。
- **错误回传机制**：工具执行失败时，将错误信息以 `role: "tool"` 回传（content 为 JSON 格式的 error），模型会基于错误信息重试或道歉。
- **重试循环**：工具出错 → 回传错误 → 模型重新决策 → 可能修正参数重试。需设置 `maxRetries` 防止无限循环。
- **多层防护**：① JSON.parse 容错 → ② 参数校验 → ③ 执行 try-catch → ④ 结果有效性检查。

## 💻 落地内容与代码

**代码实现**: [demos/stage-02/step-03/tool-error-handling.ts](../../demos/stage-02/step-03/tool-error-handling.ts)

**核心逻辑简述**:
1. 工具函数返回 `ToolResult` 类型（`{ ok, data?, error? }`），区分成功与失败。
2. `get_weather` 校验：缺少 city 参数 → 城市不存在时返回包含支持城市列表的错误信息。
3. `calculate` 工具四层校验：必填检查 → 类型检查 → 安全过滤 → 除零检测。
4. `chatWithToolErrorHandling()` 实现重试循环，最多重试 3 次。
5. 每次工具执行都有日志输出，清晰展示错误回传和模型重试过程。

**代码亮点**:
- `ToolResult` 统一返回结构，让错误处理逻辑一致。
- JSON.parse 也包了 try-catch，防止模型返回非法 JSON。
- 工具执行外层 try-catch，确保任何异常都不会导致程序崩溃。

## 🧠 相关知识点沉淀

- [Function Calling](../../concepts/api-fundamentals/function-calling.md) — 错误回传机制

## 🐞 踩坑记录与思考

- **注意**: 错误信息要写得"模型能看懂"。写"城市不存在"不如写"未找到城市'火星'的天气数据，支持的城市：北京、上海"——后者让模型知道该怎么修正。
- **注意**: 必须设置 `maxRetries`，否则模型可能陷入"出错 → 重试 → 出错"的死循环。
- **思考**: 错误回传是 Agent 自我修正能力的基础。Stage 3 的 ReAct 模式本质上就是"行动 → 观察结果（含错误） → 反思 → 再行动"的循环。

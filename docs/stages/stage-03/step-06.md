---
title: 交付物 —— 极简自主编码 Agent
date: 2026-06-20
stage: 3
step: 6
tags: [deliverable, coding-agent, harness-loop, react]
status: in-progress
related_demo: ../../demos/stage-03/step-06/coding-agent.ts
---

# Step 6: 交付物 —— 极简自主编码 Agent

## 🎯 本环节目标

整合前五步全部能力——Harness Loop 骨架 + ReAct 推理 + 文件工具 + 脚本执行 + 上下文截断——交付一个能自主完成"写脚本 → 执行 → 观察报错 → 修复 → 再执行"闭环的极简编码 Agent。这是 Phase 1 筑基期的终极交付物，也是 Stage 9 全栈研发流水线 Agent 的原型。

## 💡 核心原理速记

- **自主编码闭环**：`理解任务 → 写代码(write_file) → 执行(run_script) → 观察 stdout/stderr → 若有错则思考修复 → 再执行 → 直到成功`。这个闭环就是 Claude Code、Cursor Agent 等工具的核心机制，只是它们加了更多工具和更复杂的规划。
- **ReAct 在闭环中的价值**：每次执行后，Agent 先 `Thought`（"报错说第 5 行语法错误，我需要把 `console.log(}` 改成 `console.log()`"）再 `Action`（`write_file` 修复）。没有 Thought，Agent 可能盲目重写整个文件；有 Thought，修复更精准。
- **失败是常态**：Agent 第一次写代码大概率有 bug。交付物的验收不是"一次成功"，而是"能在有限步数内自主修复到成功"。`MAX_STEPS` 要给够（如 15 步），让 Agent 有修复空间。
- **System Prompt 是行为契约**：明确告诉 Agent 它的工具、工作方式（ReAct）、成功标准（脚本运行输出正确结果）、终止条件（成功后用自然语言总结）。

## 💻 落地内容与代码

**代码实现**: [demos/stage-03/step-06/coding-agent.ts](../../demos/stage-03/step-06/coding-agent.ts)

**核心逻辑简述**:
1. **System Prompt**：定义 Agent 身份（编码助手）、工具（read_file/write_file/list_dir/run_script）、工作方式（ReAct：先思考再行动）、成功标准、终止方式。
2. **Harness Loop**：复用 Step 1 的 `runHarness()` 骨架，接入 Step 3/4 的文件与脚本工具，每轮调用前走 Step 5 的上下文截断。
3. **ReAct 日志**：每步打印 `💭 Thought`（模型 content）与 `🔧 Action`（工具调用），让自主修复过程可见。
4. **预设任务**：`"在 workspace 下创建 fib.ts，写一个计算斐波那契数列前 10 项并打印的 TypeScript 脚本，然后运行它验证输出正确。如果有错误，修复后重新运行。"`——Agent 自主完成全流程。

**代码亮点**:
- 整合五步能力，但代码不臃肿——`runHarness()` 骨架不变，只换工具集与 System Prompt，体现"骨架与能力解耦"的设计。
- 交互式模式：用户可输入自定义编码任务，Agent 自主执行，支持 `/exit` 退出。
- 会话摘要含量化指标：步数、工具调用次数、文件操作次数、脚本执行次数、上下文截断次数——从多个维度量化 Agent 的"自主程度"。

## 🧠 相关知识点沉淀

- [Function Calling](../../concepts/api-fundamentals/function-calling.md) — 工具调用闭环
- [多轮对话与上下文管理](../../concepts/api-fundamentals/multi-turn-context.md) — 上下文截断
- [Token 与上下文窗口](../../concepts/generation-control/token-and-context-window.md) — 长任务上下文管理

## 🐞 踩坑记录与思考

- **注意**: Agent 写的脚本可能依赖项目根目录的 `tsconfig.json`，用 `tsx` 执行时若 cwd 不对会报模块解析错误。`run_script` 要把 cwd 设为 `workspace/` 或项目根，并在 System Prompt 里告诉 Agent 脚本的运行环境。
- **注意**: Agent 可能陷入"改一行 → 跑 → 报错 → 改回 → 跑 → 报错"的振荡。`MAX_STEPS` 是硬上限，但更好的做法是在 System Prompt 里要求"如果连续 3 次修复失败，停下来向用户说明困难"——这是软性自我反思。
- **思考**: 这个极简编码 Agent 已经具备 Claude Code 的雏形——差异在于工具数量（Claude Code 有几十个工具）、规划深度（Claude Code 有 TodoWrite 显式规划）、上下文管理（Claude Code 用更智能的压缩）。Stage 9 会在本步基础上升级规划与反思能力，Stage 11 会加固安全与异步。从"能跑通"到"生产级"，路径已经清晰。

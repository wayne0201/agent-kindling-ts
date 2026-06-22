---
title: Harness Loop（基础版）
phase: 1
stage: 3
tags: [harness-loop, react, agent-core, file-tools, context-management]
status: done
---

# Stage 3 · Phase 1 筑基期 —— 手撕 Harness Loop

> 从"单步反射"到"自主闭环"——把 Stage 2 的工具调用循环升级为状态驱动的执行内核，让 Agent 能思考、能动手、能自我修正。

## 🎯 阶段目标

在 Stage 2 掌握 Function Calling 的基础上，把 `processTurn()` 里的 while 循环**抽象为显式的 Harness Loop**（状态 → LLM → 解析 → 执行 → 观察），并引入 **ReAct 推理模式**（先思考再行动）。再给 Agent 装上"真实之手"——文件读写与脚本执行工具，让它能产生真实副作用。最终交付一个能自主"写脚本 → 执行 → 看报错 → 修复 → 再执行"的极简编码 Agent。

- 把 Stage 2 的隐式 while 循环重构为**状态驱动的 Harness Loop**（`AgentState` + step 计数 + 终止条件）。
- 引入 **ReAct 模式**：Thought（思考）→ Action（行动）→ Observation（观察），让 Agent 面对复杂任务先拆解再行动。
- 实现**真实文件操作工具**（`read_file` / `write_file` / `list_dir`），工作目录沙箱化。
- 实现**脚本执行工具**（`run_script`），含超时控制与输出截断。
- 落地**滑动窗口上下文截断**（README 辅助措施要求从本阶段起强制实现）。
- 交付"极简自主编码 Agent"，能自主完成创建脚本、执行、观察报错、修复的闭环。

## 📋 环节清单

| 环节 | 主题 | 验收标准 | 代码 / 文档 |
|------|------|----------|-------------|
| **Step 1** | 从 while 循环到 Harness Loop | 能看到 `[Step N]` 状态流转日志，循环可因 done / max_steps / error 正常终止 | [code](../../demos/stage-03/step-01/harness-loop.ts) · [doc](./step-01.md) |
| **Step 2** | ReAct 推理模式 | 面对条件任务（如"先查 A，若下雨再查 B"），Agent 先输出思考再行动 | [code](../../demos/stage-03/step-02/react-agent.ts) · [doc](./step-02.md) |
| **Step 3** | 文件操作工具集 | Agent 能按指令在沙箱目录内创建、读取、列出文件 | [code](../../demos/stage-03/step-03/file-tools.ts) · [doc](./step-03.md) |
| **Step 4** | 脚本执行工具 | Agent 能创建 .ts 脚本并执行，捕获 stdout / stderr，超时不卡死 | [code](../../demos/stage-03/step-04/run-script.ts) · [doc](./step-04.md) |
| **Step 5** | 滑动窗口上下文截断 | 模拟 20+ 轮工具调用，上下文被截断后 Agent 仍能正常工作 | [code](../../demos/stage-03/step-05/context-window.ts) · [doc](./step-05.md) |
| **Step 6** | 交付物 —— 极简自主编码 Agent | 给定任务"写斐波那契脚本并运行验证"，Agent 自主完成写-跑-修闭环 | [code](../../demos/stage-03/step-06/coding-agent.ts) · [doc](./step-06.md) |

> ✅ 表示已实现；本阶段六步已全部完成。

## 📝 各环节要点速览

### Step 1：从 while 循环到 Harness Loop
- **学习**：理解 Harness Loop 的本质——`状态 → LLM 决策 → 解析 → 执行 → 观察回写 → 更新状态` 的循环，直到满足终止条件。
- **任务**：把 Stage 2 `processTurn()` 的 while 循环重构为显式的 `runHarness()`，引入 `AgentState` 类型、step 计数器、三种终止条件（`done` / `max_steps` / `error`）。仍用 Stage 2 的模拟工具，聚焦循环骨架。
- **验收**：终端输出 `[Step 1/N]` 状态流转日志，循环可正常终止，不出现死循环。

### Step 2：ReAct 推理模式
- **学习**：ReAct = Reasoning + Acting。在"行动"前插入"思考"环节，让 Agent 显式输出 Thought，再决定 Action。对比 Stage 2 的"直接反射式工具调用"。
- **任务**：用 System Prompt + 结构化输出约束模型按 `Thought / Action / Observation` 推进。设计一个需要条件判断的任务（先查北京天气，若下雨再查上海天气），观察 ReAct 如何拆解。
- **验收**：Agent 面对条件任务能先输出思考再行动，思考过程可见且合理。

### Step 3：文件操作工具集
- **学习**：从"模拟工具"到"真实副作用工具"的跃迁。实现 `read_file` / `write_file` / `list_dir`，工作目录限制在 `workspace/` 沙箱内，防止越界访问。
- **任务**：实现三个文件工具，路径校验（拒绝 `..` 越界、限制在沙箱根目录），让 Agent 通过自然语言指令完成"创建 hello.txt → 读取 → 列目录"。
- **验收**：Agent 能在沙箱内正确创建、读取、列出文件，越界路径被拒绝。

### Step 4：脚本执行工具
- **学习**：用 `child_process.execFile` 执行 `tsx`/`node` 脚本。工程要点：超时控制（`timeout`）、stdout/stderr 捕获、输出长度截断（防止巨量日志撑爆上下文）。
- **任务**：实现 `run_script` 工具，让 Agent 创建一个 `.ts` 脚本后能执行它并看到输出。故意让 Agent 写一个有 bug 的脚本，观察它如何基于 stderr 修正。
- **验收**：Agent 能创建脚本并执行，看到 stdout/stderr，超时不会卡死进程。

### Step 5：滑动窗口上下文截断
- **学习**：上下文窗口有限，工具调用消息膨胀最快（每次执行脚本返回大段 stdout）。实现 token 估算（字符数近似）+ 滑动窗口截断：保留 system + 最近 N 轮，丢弃中间历史。
- **任务**：实现 `estimateTokens()` 与 `truncateMessages()`，在 Harness Loop 每轮调用前截断。模拟长任务验证截断生效。
- **验收**：20+ 轮工具调用后上下文被截断，Agent 仍能正常工作，不因 token 超限报错。

### Step 6：交付物 —— 极简自主编码 Agent
- **目标**：整合 Harness Loop + ReAct + 文件工具 + 脚本执行 + 上下文截断，交付能自主编码的 Agent。
- **任务**：给 Agent 一个任务（如"创建一个计算斐波那契数列前 10 项的 TS 脚本并运行验证"），Agent 自主完成"写脚本 → 执行 → 观察报错 → 修复 → 再执行"闭环。
- **验收**：Agent 自主完成任务，最终脚本运行成功输出正确结果，全程无需人工干预。

---

← 返回 [项目总览](../../README.md)

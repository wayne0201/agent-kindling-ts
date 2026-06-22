---
title: 脚本执行工具
date: 2026-06-20
stage: 3
step: 4
tags: [script-execution, child-process, timeout]
status: in-progress
related_demo: ../../demos/stage-03/step-04/run-script.ts
---

# Step 4: 脚本执行工具

## 🎯 本环节目标

实现 `run_script` 工具，让 Agent 能执行本地 TypeScript/JavaScript 脚本并捕获输出。这是"自主编码 Agent"的最后一块拼图——有了文件读写（Step 3）+ 脚本执行（Step 4），Agent 就能完成"写代码 → 跑代码 → 看结果"的闭环。重点解决超时控制与输出截断两个工程问题。

## 💡 核心原理速记

- **child_process.execFile**：用 `execFile`（非 `exec`）执行 `tsx`，避免 shell 注入风险——`exec` 走 shell，`execFile` 直接 spawn 进程，参数以数组传递，不被 shell 解析。
- **超时控制**：`execFile` 的 `timeout` 选项让进程超时后被 SIGTERM 杀掉。但子进程可能 spawn 孙进程导致 timeout 不彻底，生产环境需进程组 kill（本步用基础 timeout 即可）。
- **输出截断**：脚本可能输出巨量日志（如 `console.log` 循环一万次），直接塞进 `messages` 会撑爆上下文。`MAX_OUTPUT_CHARS` 截断 stdout/stderr，超出部分用 `... [截断，共 N 字符]` 提示。
- **stdout vs stderr**：两者都要捕获。stdout 是正常输出，stderr 是报错信息——Agent 修复 bug 靠的就是 stderr。回传时分别标注，让模型能区分。

## 💻 落地内容与代码

**代码实现**: [demos/stage-03/step-04/run-script.ts](../../demos/stage-03/step-04/run-script.ts)

**核心逻辑简述**:
1. 实现 `runScript(args: { filename })`：用 `execFile` 调用 `tsx` 执行 `workspace/` 下的脚本。
2. 配置 `timeout: 10_000`（10 秒）、`maxBuffer: 1MB`，捕获 stdout/stderr。
3. 输出超过 `MAX_OUTPUT_CHARS`（2000 字符）时截断，附加截断提示。
4. 返回结构化结果：`{ ok, stdout, stderr, durationMs, truncated }`。
5. 预设任务：让 Agent 先用 `write_file` 创建一个有语法错误的脚本，再用 `run_script` 执行，观察它如何基于 stderr 修正。

**代码亮点**:
- 用 `execFile` + 参数数组，杜绝 shell 注入。
- 输出截断逻辑统一封装在 `truncateOutput()`，stdout/stderr 都走同一截断。
- 回传内容明确区分 `stdout` / `stderr` / `退出码` / `耗时`，给模型足够信息做判断。

## 🧠 相关知识点沉淀

- [Function Calling](../../concepts/api-fundamentals/function-calling.md) — 工具执行与结果回传
- [Token 与上下文窗口](../../concepts/generation-control/token-and-context-window.md) — 输出截断是为了保护上下文窗口

## 🐞 踩坑记录与思考

- **注意**: `execFile` 的 `timeout` 触发后进程被杀，但回调仍会执行，`error.killed === true`。要在回调里区分"超时被杀"和"正常退出码非零"——前者是 `error.signal === 'SIGTERM'`。
- **注意**: `tsx` 作为执行器首次运行有冷启动开销（加载 TS 编译），耗时可能接近 1 秒。评估脚本性能时要扣除这个开销，或用预编译的 `.js`。
- **注意**: `runScript` 在脚本非零退出时返回 `{ ok: false, data: ... }`（含 stderr）而非 `{ ok: false, error: ... }`——这是为了让模型看到 stderr 修复 bug。harness 须优先用 `data` 字段回传，否则模型收到 `{}` 无法修复。
- **思考**: 让 Agent 执行任意代码是 Agent 安全性的最大风险点。本步的 `workspace/` 沙箱只限制了文件路径，没限制代码能力——脚本仍能 `fetch` 外网、`require` 系统模块。真正的生产级隔离需要容器（Stage 11）。

---
title: 文件操作工具集
date: 2026-06-20
stage: 3
step: 3
tags: [file-tools, sandbox, real-side-effects]
status: in-progress
related_demo: ../../demos/stage-03/step-03/file-tools.ts
---

# Step 3: 文件操作工具集

## 🎯 本环节目标

完成从"模拟工具"到"真实副作用工具"的跃迁。实现 `read_file` / `write_file` / `list_dir` 三个文件操作工具，让 Agent 能真正读写本地文件系统。引入工作目录沙箱化，防止 Agent 越界访问。

## 💡 核心原理速记

- **真实工具 vs 模拟工具**：Stage 2 的 `get_weather` 返回的是内存里的硬编码数据，没有副作用。文件工具有真实副作用——写文件会改变磁盘状态。这意味着错误更危险、调试更复杂，但也意味着 Agent 真正"能做事"了。
- **沙箱化**：所有文件操作限制在 `workspace/` 目录内。路径校验三道防线：① `path.resolve` 规范化 → ② 检查结果路径是否以沙箱根开头 → ③ 拒绝 `..` 越界。这是 Stage 11 生产级沙箱的雏形。
- **工具的 description 决定模型用法**：`write_file` 的 description 要写清"路径相对于工作目录"，否则模型可能传绝对路径。好的 description 是工具被正确调用的前提。
- **错误回传而非抛异常**：文件不存在、路径越界等错误，不抛异常中断循环，而是以 `role: "tool"` 回传错误信息，让 Agent 自行修正（复用 Stage 2 Step 3 的模式）。

## 💻 落地内容与代码

**代码实现**: [demos/stage-03/step-03/file-tools.ts](../../demos/stage-03/step-03/file-tools.ts)

**核心逻辑简述**:
1. 定义 `WORKSPACE_DIR`（`demos/stage-03/workspace/`），所有文件操作限制在此目录内。
2. 实现 `readFile` / `writeFile` / `listDir` 三个函数，统一走 `resolveSafePath()` 路径校验。
3. `resolveSafePath()`：`path.resolve` 规范化后检查 `startsWith(WORKSPACE_DIR)`，越界返回错误。
4. 注册三个工具到 `tools` 与 `toolMap`，接入 Harness Loop。
5. 用一个预设任务驱动 Agent："在 workspace 下创建 hello.txt 写入'你好'，然后读取它确认内容，最后列出 workspace 目录"。

**代码亮点**:
- `resolveSafePath()` 是所有文件工具的安全闸门，单一职责、统一复用。
- 工具实现返回 `ToolResult`（`{ ok, data?, error? }`），错误以结构化数据回传而非抛异常。
- 启动时自动创建 `workspace/` 目录（`fs.mkdirSync` + `recursive`），保证沙箱存在。

## 🧠 相关知识点沉淀

- [Function Calling](../../concepts/api-fundamentals/function-calling.md) — 工具定义与执行回传
- [环境变量与防呆设计](../../concepts/engineering-practice/env-and-fail-fast.md) — 沙箱目录的初始化保障

## 🐞 踩坑记录与思考

- **注意**: `path.resolve` 会把相对路径解析为相对于 `process.cwd()`，而非脚本所在目录。沙箱根目录要用 `import.meta.dirname` 锚定，否则在不同 cwd 下运行行为不一致。
- **注意**: 仅检查路径是否包含 `..` 不够——符号链接、`%2e%2e` 编码等都能绕过。最可靠的方式是 `path.resolve` 规范化后检查结果是否以沙箱根为前缀。
- **思考**: 给 Agent 真实文件权限是危险的——这就是为什么 Claude Code 这类工具都有工作目录限制和确认机制。本步的沙箱是最简版，Stage 11 会升级为进程级沙箱（Docker/容器）。

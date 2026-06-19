---
title: 持久化对话助手
date: 2026-06-19
stage: 1
step: 6
tags: [persistence, fs, json, context-management]
status: done
related_demo: ../../demos/stage-01/step-06/persistent-chat.ts
---

# Step 6: 持久化对话助手

## 🎯 本环节目标

解决 Step 5 进程退出后 `messages` 数组消失的问题。引入 `fs` 模块，将对话历史序列化到 `chat_history.json` 文件中，实现跨进程重启的记忆持久化，并提供 `/clear` 指令让用户掌控重置。

## 💡 核心原理速记

- **内存 vs 磁盘**：Step 5 的记忆在内存（进程退出即消失），Step 6 在每轮对话后将 `messages` 写入磁盘（JSON 文件），启动时再读回来。磁盘是"备份"，内存是"工作区"。详见 [对话持久化](../../concepts/engineering-practice/chat-persistence.md)。
- **序列化**：`JSON.stringify()` 把 JS 对象转成字符串写入文件，`JSON.parse()` 把文件内容还原为 JS 对象。JSON 只能存数据（字符串、数字、数组、对象），不能存函数或循环引用。
- **`/clear` 的设计意义**：用户需要"重置对话"的控制权。Step 5 只能靠重启清零，Step 6 用 `/clear` 实现秒级重置并删除历史文件。
- **容错设计**：历史文件可能损坏（手动编辑、磁盘错误）。启动加载时 `try/catch` 包裹 JSON 解析，损坏则警告并从零开始，不阻塞程序。

## 💻 落地内容与代码

**代码实现**: [demos/stage-01/step-06/persistent-chat.ts](../../demos/stage-01/step-06/persistent-chat.ts)

**核心逻辑简述**:
1. 定义 `HISTORY_FILE` 路径（`import.meta.dirname` + `chat_history.json`），确保文件落在脚本同级目录。
2. `loadHistory()` —— 启动时检查文件是否存在，存在则 `JSON.parse()` 恢复 `messages` 并推算 `roundCount`；文件不存在或 JSON 损坏则初始化 System Prompt 并提示"新对话"。
3. `saveHistory()` —— 每轮模型回复追加到 `messages` 后，调用 `fs.writeFileSync()` 以美化 JSON 格式落盘。
4. `clearHistory()` —— 重置 `messages` 为仅含 System Prompt，删除 `chat_history.json` 文件，清零计数器。
5. 主循环在 Step 5 基础上增加 `/clear` 分支判断。
6. 退出时打印摘要，额外显示历史文件路径。

**代码亮点**:
- `import.meta.dirname` 固定文件路径，确保 `chat_history.json` 始终生成在脚本所在目录，不受工作目录影响。
- `loadHistory` 通过 `messages.filter(m => m.role === 'user').length` 从历史文件推算对话轮数，不额外存储元数据。
- 容错分层：JSON 解析异常不崩溃；文件写入失败只打警告；文件删除失败静默跳过。持久化不应成为单点故障。

## 🧠 相关知识点沉淀

- [对话持久化](../../concepts/engineering-practice/chat-persistence.md) — 本环节新增的核心概念
- [多轮对话与上下文管理](../../concepts/api-fundamentals/multi-turn-context.md)
- [环境变量与防呆设计](../../concepts/engineering-practice/env-and-fail-fast.md)（同属工程实践范畴）

## 🐞 踩坑记录与思考

- **思考**: Step 5 的验收测试"我叫小明 → 我叫什么"只需要一次运行。Step 6 的验收需要**两次运行**——第一次存盘，第二次验证记忆存活。这体现了持久化的核心价值：状态跨越进程生命周期。
- **思考**: JSON 文件作为持久化方案适合原型和小规模对话。但当对话达到数百轮、消息数千条时，全量读写 JSON 会变慢，且文件可能达到几十 MB。生产环境需考虑增量追加、数据库或分片存储。
- **观察**: `/clear` 后不仅清空了内存中的 `messages`，也删除了磁盘文件。这保证了"清空"的语义完整性——不会出现内存空了但文件还在（下次启动又恢复）的尴尬。

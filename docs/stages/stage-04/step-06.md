---
title: 交付物 —— 本地 PDF 语义问答脚本
date: 2026-06-23
stage: 4
step: 6
tags: [deliverable, rag, pdf-qa, interactive]
status: in-progress
related_demo: ../../demos/stage-04/step-06/pdf-qa-agent.ts
---

# Step 6: 交付物 —— 本地 PDF 语义问答脚本

## 💡 先说人话

**前面五个 Step 拼出了一个能真正用起来的命令行问答工具。**

在终端里输入 `/ingest llm-handbook.txt` 导入文档，输入 `/ask 什么是上下文窗口？` 提问，工具自动翻抽屉、找纸条、让 LLM 照着回答。输入 `/exit` 退出，向量库自动存盘，下次打开接着用。

## 🎯 本环节目标

整合 Step 1-5 全部能力，交付一个交互式的本地文档语义问答系统。支持 `/ingest` 导入文档（.pdf/.txt/.md）、`/ask` 问答（附来源片段与相似度）、`/list` 查看已索引文档、`/reset` 清空、`/exit` 退出。向量库跨进程持久化，无需每次重新索引。这是 Phase 2 进阶期的第一个交付物，也是 Stage 5 高级 RAG 引擎的基础。

## 💡 核心原理速记

- **整合清单**：Step 1 Embedding 向量化 + Step 2 文本分块 + Step 3 PDF 解析清洗 + Step 4 向量库 + Step 5 RAG 闭环。`_shared/` 共享模块是这五步能力的"提炼版"。
- **交互式管线**：`/ingest` 触发离线索引（解析→分块→向量化→入库→持久化），`/ask` 触发在线查询（检索→拼Prompt→生成）。这是 RAG 系统的标准双阶段架构。
- **持久化复用**：向量库保存到 `data/vector-store.json`，启动时自动加载。向量化是最贵的操作，持久化让"索引一次，多次查询"成为可能。
- **来源可溯源**：每次回答附带检索到的片段编号、来源文件名、相似度分数。这是 RAG 区别于"直接问 LLM"的关键价值——回答有据可查。

## 💻 落地内容与代码

**代码实现**: [demos/stage-04/step-06/pdf-qa-agent.ts](../../demos/stage-04/step-06/pdf-qa-agent.ts)

**核心逻辑简述**:
1. 启动时加载已有向量库（`store.load(STORE_FILE)`），非空则显示已索引文档。
2. `/ingest <路径>`：支持相对 `knowledge/` 的路径或绝对路径 → `parseDocument` → `splitText` → `store.addTexts` → `store.save`。
3. `/ask <问题>`：`ragQuery` 检索 topK → 展示片段来源与相似度 → LLM 生成回答。
4. 直接输入文本默认当作问题处理，降低使用门槛。
5. `SIGINT`（Ctrl+C）和 `/exit` 都会自动持久化向量库。

**代码亮点**:
- 离线索引与在线查询分离，符合 RAG 系统的标准架构。
- 向量库跨进程持久化，重启后自动加载，无需重新索引。
- 来源可溯源：每个回答都标注检索片段的来源与相似度。

## 🧠 相关知识点沉淀

- [RAG 检索增强生成](../../concepts/rag/rag.md) — 本交付物的核心架构
- [Embedding 与向量化](../../concepts/rag/embedding.md) — 检索的基础
- [对话持久化](../../concepts/engineering-practice/chat-persistence.md) — 向量库持久化与 Stage 1 的对话持久化同理

## 🐞 踩坑记录与思考

- **注意**: `/ingest` 同一文件多次导入会产生重复记录（不去重）。生产系统应按文件内容哈希去重，或先删除该来源的旧记录再导入。本阶段为保持简单未做去重。
- **注意**: 向量库文件会随导入增长（每条约 20KB）。`/reset` 会删除文件并清空内存库，是"重置"而非"删除单文档"——生产系统需要按来源删除的能力。
- **思考**: 这个交付物已经是一个可用的本地知识库问答系统。与 Stage 3 的编码 Agent 对比——Stage 3 的 Agent 能"动手"（写文件、跑脚本），Stage 4 的系统能"查资料"（检索、引用）。Stage 9 会把两者结合：Agent 既能检索知识库，又能执行代码，实现"全栈研发流水线"。从"单能力"到"能力组合"，路径已经清晰。

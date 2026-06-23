---
title: 手写向量库 —— 持久化的语义记忆
date: 2026-06-23
stage: 4
step: 4
tags: [vector-store, persistence, cosine-similarity]
status: in-progress
related_demo: ../../demos/stage-04/step-04/vector-store.ts
---

# Step 4: 手写向量库 —— 持久化的语义记忆

## 💡 先说人话

**向量库就是一个"贴了坐标的纸条抽屉"。**

Step 2 撕好的纸条，Step 1 给每张贴上了坐标（向量），Step 4 把所有 [纸条, 坐标] 对收进一个抽屉，存到 JSON 文件里。下次再打开，直接读文件就能用，不用重新贴坐标。

第一次打开抽屉要花 2-5 秒（贴坐标花钱），第二次 1 毫秒（纯读文件）。这就是"索引一次，反复查询"。

## 🎯 本环节目标

不依赖任何向量数据库，手写一个基于 JSON 文件的向量库。实现 `addTexts`（批量入库）、`search`（语义检索 topK）、`save`/`load`（持久化）、`clear`（清空）。把知识库分块入库，检索验证，持久化后重载验证。这是"手撕 RAG 内核"的体现——先理解原理，Stage 5+ 再引入更高效的索引。

## 💡 核心原理速记

- **向量库的本质**：`[文本, 向量]` 对的集合 + 相似度计算。没有魔法：存的是文本和向量，查的是"谁离 query 最近"。详见 [Embedding 与向量化](../../concepts/rag/embedding.md)。
- **线性扫描 O(N×D)**：检索时把 query 向量化，与所有记录逐一算余弦相似度，排序取 topK。N 是记录数，D 是向量维度（2048）。小数据集（几百条）够用，大数据集需 ANN（近似最近邻）索引——Stage 5+ 主题。
- **批量向量化**：入库时用 `getEmbeddings(texts[])` 一次性传入所有 chunk，比逐条调用快得多。GLM `embedding-3` 支持批量 input。
- **JSON 持久化**：把 `records` 数组序列化为 JSON 文件。简单但够用——跨进程可复用，无需每次重新索引（向量化是 RAG 管线中最贵的操作）。
- **这是 Stage 3 截断丢失记忆的解决方案**：Stage 3 的滑动窗口截断让 Agent 忘了早期信息；向量库让 Agent 能从外部记忆中"召回"相关内容，突破上下文窗口的硬上限。

## 💻 落地内容与代码

**代码实现**: [demos/stage-04/step-04/vector-store.ts](../../demos/stage-04/step-04/vector-store.ts) · 共享模块 [_shared/vector-store.ts](../../demos/stage-04/_shared/vector-store.ts)

**核心逻辑简述**:
1. 内联实现 `VectorStore` 类（与 `_shared/vector-store.ts` 逻辑一致，复用 `_shared/embedding.ts` 的向量化能力）。
2. 解析知识库 → 分块（chunkSize=400, overlap=60）→ 批量向量化入库。
3. 对三个查询（上下文窗口/Function Calling/RAG）做 topK=2 检索，展示相似度与片段预览。
4. `save` 到 `data/vector-store.json`，新建空库 `load` 后验证检索仍有效。

**代码亮点**:
- 内联实现让你看清向量库的每个细节——它只是一个数组 + 相似度排序。
- 持久化 + 重载验证，证明向量库可跨进程复用。

## 🧠 相关知识点沉淀

- [Embedding 与向量化](../../concepts/rag/embedding.md) — 向量库的存储与检索单元
- [文本分块](../../concepts/rag/chunking.md) — 入库前的预处理
- [Token 与上下文窗口](../../concepts/generation-control/token-and-context-window.md) — 向量库是突破上下文窗口的"外部记忆"

## 🐞 踩坑记录与思考

- **注意**: 向量化是 RAG 管线中最贵的操作（按 token 计费）。持久化向量库的意义在于"索引一次，多次查询"——不要每次启动都重新索引。
- **注意**: JSON 持久化会把 2048 维浮点数数组全部写入文件，文件较大（每条约 20KB）。生产环境应用二进制格式（如 FAISS 的索引文件），但本阶段 JSON 足够清晰。
- **思考**: 线性扫描的瓶颈在 N（记录数）。1000 条记录 × 2048 维，每次检索约 200 万次浮点乘法，毫秒级完成。但 10 万条记录就要 2 亿次，开始变慢。这就是为什么生产 RAG 用 ANN 索引（如 HNSW）——牺牲一点精度换数量级的速度提升。

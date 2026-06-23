---
title: 检索增强生成（RAG 闭环）
date: 2026-06-23
stage: 4
step: 5
tags: [rag, retrieval, generation, prompt-engineering]
status: in-progress
related_demo: ../../demos/stage-04/step-05/rag-query.ts
---

# Step 5: 检索增强生成（RAG 闭环）

## 💡 先说人话

**RAG 就是"开卷考试"——不让模型凭记忆答，让它查资料答。**

普通 Chat 是你问什么它凭记忆答，知识有截止日期，不知道也可能编。RAG 多了一步：你先问，它先翻抽屉找最相关的纸条，把纸条贴在卷子上，再照着纸条回答。纸条上没有的，就老实说不知道。

代码就三句话：① 翻抽屉找纸条 ② 把纸条拼成参考资料 ③ 让 LLM 照着答。

## 🎯 本环节目标

把检索（Retrieval）和生成（Generation）拼成闭环：query → 向量检索 topK → 拼进 Prompt 上下文 → LLM 基于资料回答。对域内问题（知识库有答案）和域外问题（知识库无答案）分别测试，验证 System Prompt 约束"只根据资料回答，资料没有就说不知道"的防幻觉效果。

## 💡 核心原理速记

- **RAG = "开卷考试"**：不让模型凭记忆答，让它查资料答。流程：query → 向量检索 topK 片段 → 拼进 Prompt 的上下文 → LLM 基于上下文生成回答。详见 [RAG 检索增强生成](../../concepts/rag/rag.md)。
- **System Prompt 是防幻觉的关键**：明确约束"只能基于【检索资料】回答，不要编造；资料中没有就说'根据已有资料无法回答'"。没有这个约束，模型可能把检索片段当"参考"然后自由发挥，产生幻觉。
- **域内 vs 域外**：域内问题（知识库有答案）检索到高相似度片段，回答准确；域外问题（知识库无答案）相似度低，模型应拒绝编造。相似度分数是判断"有没有查到"的信号。
- **检索质量决定回答质量**：如果检索不到相关片段，再强的 LLM 也答不准。这是 RAG 的核心局限——Stage 5 引入重排序与查询重写来优化检索。

## 💻 落地内容与代码

**代码实现**: [demos/stage-04/step-05/rag-query.ts](../../demos/stage-04/step-05/rag-query.ts)

**核心逻辑简述**:
1. 构建向量库（解析 → 分块 → 入库），复用 `_shared` 全部模块。
2. 实现 `ragQuery(question)`：`store.search(question, 3)` → 拼接上下文（含来源与相似度）→ 构造 System Prompt（含防幻觉约束）→ `client.chat.completions.create` 生成。
3. 域内问题测试：上下文窗口/Function Calling/RAG（知识库中有答案）。
4. 域外问题测试：世界杯冠军/高铁票价（知识库中无答案，应拒绝编造）。

**代码亮点**:
- `ragQuery` 函数仅 28 行：① 检索 → ② 拼上下文 → ③ 构造 Prompt → ④ LLM 生成，清晰展示 RAG 核心流程。
- 域内/域外对比实验，直观展示 RAG 的"开卷考试"特性与防幻觉效果。
- 上下文拼接保持精简（仅片段编号 + 文本），让学习者聚焦 RAG 骨架。

## 🧠 相关知识点沉淀

- [RAG 检索增强生成](../../concepts/rag/rag.md) — 本环节的核心概念
- [System Prompt 与结构化输出](../../concepts/api-fundamentals/system-prompt-and-structured-output.md) — 防幻觉约束依赖 System Prompt
- [Embedding 与向量化](../../concepts/rag/embedding.md) — 检索环节的基础

## 🐞 踩坑记录与思考

- **注意**: 检索片段不要拼太多——topK=3 是经验值。拼太多会撑爆上下文窗口且引入噪声，拼太少可能漏掉关键信息。
- **注意**: 域外问题的相似度并非总是很低——如果知识库中有"看似相关但实际无关"的片段，相似度可能虚高。这就是为什么需要 Stage 5 的重排序——用更精细的模型对初筛结果二次排序。
- **思考**: RAG 与微调的对比——微调把知识"烧进"模型权重，更新成本高；RAG 把知识放在外部向量库，更新只需重新索引文档。对于频繁更新的私域知识，RAG 几乎总是比微调更合适。

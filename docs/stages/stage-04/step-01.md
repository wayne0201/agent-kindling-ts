---
title: Embedding 初体验 —— 把文本变成向量
date: 2026-06-23
stage: 4
step: 1
tags: [embedding, vector, cosine-similarity]
status: in-progress
related_demo: ../../demos/stage-04/step-01/embedding-basics.ts
---

# Step 1: Embedding 初体验 —— 把文本变成向量

## 💡 先说人话

**Embedding 就是给每段文字贴上一个"语义坐标"。**

比如"猫是宠物"和"小猫很可爱"这两句话，意思差不多，它们被贴上的坐标就很接近。而"猫是宠物"和"今天股市大涨"完全不搭边，坐标就离得很远。

贴完坐标之后，"找最相关的内容"就变成了"找坐标最近的向量"——一个简单的数学计算。这就是整个 RAG 检索的基石。

## 🎯 本环节目标

理解 Embedding 的本质——把文本映射为高维向量，语义相近的文本在向量空间中距离也近。调用智谱 GLM 的 `embedding-3` 模型，把句子变成 2048 维向量，用余弦相似度验证"语义距离"可以被量化。这是 RAG 的地基：没有向量化，就没有语义检索。

## 💡 核心原理速记

- **Embedding = 文本的语义坐标**：一段文本经过 Embedding 模型，变成一个高维浮点数向量（GLM `embedding-3` 输出 2048 维）。这个向量就是文本在"语义空间"中的坐标——语义相近的文本，坐标也相近。详见 [Embedding 与向量化](../../concepts/rag/embedding.md)。
- **余弦相似度**：衡量两个向量"方向"的一致性，值域 [-1, 1]。越接近 1 表示语义越相近，越接近 0 表示越不相关。公式：`cos(θ) = (A·B) / (|A| × |B|)`——点积除以模长之积。
- **语义距离被量化**：这是 Embedding 最关键的洞察。"找最相关的内容"变成了"找最近的向量"——这就是向量检索的基础。同义句相似度高，无关句相似度低，且差异显著。
- **Embedding 接口与 Chat 接口共用 client**：同一个 OpenAI SDK client，只是调用 `client.embeddings.create({ model, input })` 而非 `client.chat.completions.create`。`input` 可以是单条字符串或字符串数组（批量）。

## 💻 落地内容与代码

**代码实现**: [demos/stage-04/step-01/embedding-basics.ts](../../demos/stage-04/step-01/embedding-basics.ts)

**核心逻辑简述**:
1. 内联实现 `cosineSimilarity(a, b)`——点积除以模长之积。
2. 内联实现 `embed(text)`——调用 `client.embeddings.create`，返回向量数组。
3. 设计三组句子对：同义（猫/小猫）、相关（猫/狗）、无关（猫/股市），预期相似度递减。
4. 先展示单条文本的向量维度与前 5 维，再对三组句子对计算相似度并排序。

**代码亮点**:
- 本步自包含（不依赖 `_shared`），让你看清最原始的 API 调用与相似度计算。
- 三组对比实验让"语义距离可量化"这个抽象概念变得可观察。

## 🧠 相关知识点沉淀

- [Embedding 与向量化](../../concepts/rag/embedding.md) — 本环节的核心概念
- [余弦相似度](../../concepts/rag/cosine-similarity.md) — RAG 检索的核心度量，为什么用它而不是欧氏距离
- [Token 与上下文窗口](../../concepts/generation-control/token-and-context-window.md) — Embedding 是突破上下文窗口限制的钥匙

## 🐞 踩坑记录与思考

- **注意**: DeepSeek 官方 API **不提供 Embedding 服务**（`/embeddings` 端点返回 404，实测 DeepSeek 只暴露 `deepseek-v4-flash` / `deepseek-v4-pro` 两个对话模型）。因此 Embedding 必须单独配置。本项目采用 **Chat 与 Embedding 完全解耦**的设计：`LLM_PROVIDER`（glm | deepseek）只管 Chat，`EMBEDDING_*` 三件套只管 Embedding，两者互不影响。在 `.env` 中配置：

  ```bash
  # Chat（可选 glm 或 deepseek）
  LLM_PROVIDER=deepseek
  DEEPSEEK_API_KEY=sk-xxx

  # Embedding（独立配置，推荐智谱 GLM embedding-3）
  EMBEDDING_API_KEY=你的智谱 API Key
  EMBEDDING_BASE_URL=https://open.bigmodel.cn/api/paas/v4
  EMBEDDING_MODEL=embedding-3
  ```

- **注意**: 代码内置了启动前校验（`validateEmbeddingConfig()`）。如果 `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL` 任一缺失或仍为占位符，脚本会**立即报错**并打印推荐方案，而不是等到调用 API 时才报 401/404。

- **⚠️ 关键**: OpenAI SDK v6 将 `encoding_format` 默认值从 `'float'` 改为 `'base64'`。智谱等第三方 API 返回的是 JSON 浮点数组，SDK 按 base64 解码会导致**全零向量**（512 维全是 0，而不是期望的 2048 维非零值）。修复方法：调用 `client.embeddings.create()` 时显式传入 `encoding_format: 'float'`。本步代码已包含此修复。

- **注意**: `client.embeddings.create` 的 `input` 参数支持字符串数组（批量向量化），比逐条调用快得多。Step 4 的向量库入库会用批量接口。

- **思考**: 余弦相似度衡量的是"方向"而非"距离"（欧氏距离）。为什么用余弦而非欧氏？因为文本向量化的"模长"受文本长度影响，而"方向"才代表语义。两段长短不同但语义相近的文本，余弦相似度依然高。

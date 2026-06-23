---
title: 向量检索与 RAG 基础
phase: 2
stage: 4
tags: [rag, embedding, vector-search, chunking, pdf]
status: in-progress
---

# Stage 4 · Phase 2 进阶期 —— 向量检索与 RAG 基础

> **一句话：不塞整本书，只递最相关的几页纸条。** 把知识库切成小段 → 每段变成向量 → 提问时找到最相似的几段 → 拼进 Prompt 给 LLM。这就是 RAG（检索增强生成）。
>
> 从"易失的工作记忆"走向"可检索的长期记忆"——Stage 3 的滑动窗口截断让 Agent 忘了早期信息，本阶段让 Agent 能从外部知识库中"召回"相关内容，突破上下文窗口的硬上限。

## ⚠️ 前置准备：配置 Embedding 服务

本阶段所有环节（Step 1/4/5/6）都需要 **Embedding 服务**来将文本向量化。这是 RAG 的地基——没有 Embedding，就没有语义检索。

Embedding 配置与 Chat 配置**完全独立**，即使你用 DeepSeek 做 Chat，也需要单独配置一个支持 Embedding 的 Provider。

### 推荐方案

| 方案 | 模型 | 维度 | 费用 | 说明 |
|------|------|------|------|------|
| **A：智谱 GLM（推荐）** | `embedding-3` | 2048 | 有免费额度 | 本项目默认推荐，与智谱 Chat 共用 Key |
| **B：SiliconFlow** | `BAAI/bge-m3` | 1024 | 免费 | OpenAI 兼容接口，注册即用 |
| **C：其他** | 任意 OpenAI 兼容 Embedding | — | — | 填入对应的 Key/URL/Model 即可 |

### 配置方法

在 `.env` 文件中设置以下三个变量：

```bash
# 方案 A：智谱 GLM（推荐）
EMBEDDING_API_KEY="你的智谱 API Key"
EMBEDDING_BASE_URL="https://open.bigmodel.cn/api/paas/v4"
EMBEDDING_MODEL="embedding-3"

# 方案 B：SiliconFlow
EMBEDDING_API_KEY="你的 SiliconFlow API Key"
EMBEDDING_BASE_URL="https://api.siliconflow.cn/v1"
EMBEDDING_MODEL="BAAI/bge-m3"
```

> **注意**：DeepSeek 官方 API **不提供 Embedding 服务**（实测 `/embeddings` 端点返回 404），因此不能用 DeepSeek 作为 Embedding Provider。代码会在启动时自动校验配置，未配置时会给出明确的错误提示。

### 配置验证

代码已内置启动前校验，如果 Embedding 配置缺失或未填写，运行时会立即报错并提示推荐方案，不会等到 API 调用才发现问题。

## 🎯 阶段目标

在 Stage 3 掌握 Harness Loop 与上下文截断的基础上，引入 **Embedding 向量化** 与 **向量检索**，构建 RAG（检索增强生成）的基础架构。不依赖任何重框架，手写向量库与检索逻辑，深刻理解"文档 → 分块 → 向量化 → 入库 → 检索 → 生成"的完整管线。最终交付一个基于本地 PDF 的语义问答脚本。

- 理解 Embedding 的本质：文本 → 高维向量，语义相近则向量相近。
- 掌握余弦相似度，验证"语义距离"可以被量化。
- 实现"固定长度 + 重叠窗口"文本分块策略，理解分块粒度对检索精度的影响。
- 用 pdf-parse 解析本地 PDF，做文本清洗（Garbage In, Garbage Out）。
- 手写基于 JSON 文件的向量库（addTexts / search / save / load），不依赖向量数据库。
- 落地 RAG 闭环：检索 topK 片段 → 拼进 Prompt 上下文 → LLM 基于资料回答。
- 交付交互式本地 PDF 语义问答系统，支持 `/ingest` 导入、`/ask` 问答、来源可溯源。

## 📋 环节清单

| 环节 | 主题 | 验收标准 | 代码 / 文档 |
|------|------|----------|-------------|
| **Step 1** | Embedding 初体验 | 三组句子对的相似度排序符合预期（同义 > 相关 > 无关） | [code](../../demos/stage-04/step-01/embedding-basics.ts) · [doc](./step-01.md) |
| **Step 2** | 文本分块（Chunking） | 长文本被正确切分，重叠区域可见，能解释粒度对检索的影响 | [code](../../demos/stage-04/step-02/chunking.ts) · [doc](./step-02.md) |
| **Step 3** | PDF 解析与文本清洗 | 能从 PDF/txt 提取文本并清洗，清洗前后字符数有差异 | [code](../../demos/stage-04/step-03/parse-pdf.ts) · [doc](./step-03.md) |
| **Step 4** | 手写向量库 | 入库后检索返回相关结果，持久化后重载检索仍有效 | [code](../../demos/stage-04/step-04/vector-store.ts) · [doc](./step-04.md) |
| **Step 5** | RAG 闭环 | 域内问题基于资料回答，域外问题拒绝编造 | [code](../../demos/stage-04/step-05/rag-query.ts) · [doc](./step-05.md) |
| **Step 6** | 交付物 —— 本地 PDF 语义问答 | 导入文档后能针对内容提问，回答附来源片段，跨进程持久化 | [code](../../demos/stage-04/step-06/pdf-qa-agent.ts) · [doc](./step-06.md) |

> ✅ 表示已实现；本阶段六步已全部完成。

## 📝 各环节要点速览

### Step 1：Embedding 初体验 —— 把文本变成向量
- **学习**：Embedding 是把文本映射为高维向量的技术，语义相近的文本在向量空间中距离也近。智谱 GLM 的 `embedding-3` 模型输出 2048 维向量。
- **任务**：调用 `/embeddings` 接口，把三组句子对（同义/相关/无关）向量化，用余弦相似度验证语义距离可被量化。
- **验收**：相似度排序符合预期——同义 > 相关 > 无关。

### Step 2：文本分块（Chunking）—— 知识的切分艺术
- **学习**：分块粒度 = 检索精度。太粗（整篇一个向量）检索不到细节，太细（按句）丢失上下文，段落级（300-500 字符）是甜点区。overlap 重叠窗口防止语义在边界被硬切断。
- **任务**：实现 `splitText(text, chunkSize, overlap)`，对知识库样本分块，对比不同参数的切分效果。
- **验收**：长文本被正确切分，重叠区域可见，能解释粒度对检索的影响。

### Step 3：PDF 解析与文本清洗
- **学习**：PDF 解析是 RAG 的"入口"——Garbage In, Garbage Out。PDF 提取的文本常带多余空白、换行、页眉页脚碎片，不清洗会污染检索质量。
- **任务**：用 pdf-parse 解析 PDF（动态导入，未安装时优雅降级到 txt），实现 `cleanText` 清洗管线，展示清洗前后对比。
- **验收**：能从文档提取文本并清洗，清洗前后字符数有差异，`parseDocument` 统一入口按扩展名分发。

### Step 4：手写向量库 —— 持久化的语义记忆
- **学习**：向量库的本质 = [文本, 向量] 对的集合 + 相似度计算。没有魔法：存的是文本和向量，查的是"谁离 query 最近"。线性扫描 O(N×D) 在小数据集上够用。
- **任务**：手写 `VectorStore` 类（addTexts / search / save / load / clear），把知识库分块入库，检索验证，持久化后重载验证。
- **验收**：入库后检索返回相关结果，JSON 持久化后重载检索仍有效。

### Step 5：检索增强生成（RAG 闭环）
- **学习**：RAG = 检索 + 生成 = "开卷考试"。query → 向量检索 topK → 拼进 Prompt 上下文 → LLM 基于资料回答。System Prompt 约束"只根据资料回答，资料没有就说不知道"是防幻觉的关键。
- **任务**：实现 `ragQuery(question)`，对域内问题（知识库有答案）和域外问题（知识库无答案）分别测试。
- **验收**：域内问题基于检索资料准确回答，域外问题相似度低且模型拒绝编造。

### Step 6：交付物 —— 本地 PDF 语义问答脚本
- **目标**：整合 Step 1-5 全部能力，交付交互式本地文档语义问答系统。
- **任务**：实现 `/ingest`（解析→分块→向量化→入库→持久化）、`/ask`（RAG 查询+来源展示）、`/list`、`/reset`、`/exit` 指令。向量库跨进程持久化，无需每次重新索引。
- **验收**：导入文档后能针对内容提问，回答附来源片段与相似度，跨进程重启后向量库仍可用。

---

← 返回 [项目总览](../../README.md)

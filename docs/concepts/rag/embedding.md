---
concept: Embedding
tags: [rag, vector, core-mechanism]
last_updated: 2026-06-23
---

# 概念：Embedding

## 💡 先说人话

**Embedding 就是给每段文字贴上一个"语义坐标"。**

两个意思相近的句子，坐标就很接近；两个不相关的句子，坐标就离得远。比如 "猫是宠物" 和 "小猫很可爱"，它们的坐标几乎指向同一个方向；而 "猫是宠物" 和 "股市大涨"，坐标指向完全不同的方向。

贴完坐标之后，"找最相关的内容" 就变成了一个简单的数学题：**找坐标最近的向量**。整个过程没有魔法——把文字变成一堆浮点数，然后比大小。

## 📖 一句话定义

Embedding 把一段文本映射为一个高维浮点向量（如 2048 维），使得**语义相近的文本在向量空间中距离也近**——这是把"语义"变成"可计算距离"的关键一步，也是整个 RAG 体系的地基。

## ⚙️ 深入原理

### 文本 → 向量的映射

Embedding 模型本质上是一个训练好的神经网络：输入一段 token 序列，输出一个固定维度的浮点数数组。这个过程不可逆——你无法从向量还原原文，但向量之间可以比较距离。

```
"什么是上下文窗口？"  ──→  [0.012, -0.34, 0.88, ..., 0.05]  (2048 维)
"上下文窗口是什么？"  ──→  [0.011, -0.33, 0.87, ..., 0.06]  (与上一条非常接近)
"今天天气不错"        ──→  [-0.45, 0.21, -0.09, ..., -0.77] (与上两条相距甚远)
```

关键认知：Embedding 模型在训练时见过海量"同义句对""相关句对""无关句对"，学会了把语义关系压缩进向量空间的方向与模长。我们调用 API 时只是复用这个已训练好的映射函数。

### 为什么"语义相近 = 向量相近"

向量空间里的"近"用**距离**或**相似度**衡量。两个向量方向越一致，夹角越小，余弦相似度越接近 1。Embedding 模型的训练目标就是让同义/相关句对的向量夹角小、无关句对的夹角大——所以"语义相近"被转化成了"向量夹角小"。

注意：这里比的是**方向**而不是绝对位置。两段长短不同但语义相近的文本，向量模长可能不同，但方向（夹角）接近——这正是用余弦相似度而非欧氏距离的原因。

### Embedding 服务配置

本项目采用 **Chat 与 Embedding 完全解耦** 的设计。`LLM_PROVIDER`（glm | deepseek）只管对话模型，Embedding 通过独立的 `EMBEDDING_*` 三件套配置，支持任意 OpenAI 兼容的 Embedding 服务。

```bash
# .env —— Embedding 独立配置（Stage 4+ 需要）
EMBEDDING_API_KEY="你的 Embedding API Key"
EMBEDDING_BASE_URL="https://open.bigmodel.cn/api/paas/v4"
EMBEDDING_MODEL="embedding-3"
```

**推荐模型**：智谱 GLM `embedding-3`（2048 维，免费额度可用）。也支持 SiliconFlow `BAAI/bge-m3`（1024 维，免费）等任意 OpenAI 兼容服务。

> **注意**：DeepSeek 官方 API 不提供 Embedding 服务（`/embeddings` 端点返回 404）。如果 `LLM_PROVIDER=deepseek`，仍需单独配置 `EMBEDDING_*` 指向支持 Embedding 的服务。

### 调用示例

```typescript
import { EMBEDDING_API_KEY, EMBEDDING_BASE_URL, EMBEDDING_MODEL } from '../common/config.js';

const client = new OpenAI({ apiKey: EMBEDDING_API_KEY, baseURL: EMBEDDING_BASE_URL });

// 单条文本 → 向量
const response = await client.embeddings.create({
  model: EMBEDDING_MODEL,   // 'embedding-3'
  input: text,
});
return response.data[0].embedding;  // number[]，长度 2048
```

`embedding-3` 输出 **2048 维**向量。维度越高，能表达的语义细节越多，但存储与计算成本也越高（线性扫描检索的复杂度是 O(N×D)）。2048 维在精度与成本之间是一个常用平衡点。

### 余弦相似度

衡量两个向量"方向一致性"的标准度量，是 RAG 检索的核心。详见 **[余弦相似度 概念文档](./cosine-similarity.md)**。

简要公式：

```
cos(θ) = (A·B) / (|A| × |B|)  ∈ [-1, 1]
```

- 接近 1 → 方向一致，语义高度相关
- 接近 0 → 正交，语义无关
- 用于向量库的 `search(query, topK)`：对库中每条记录算相似度，取 topK

### 批量向量化

逐条调用 Embedding API 会产生大量网络往返。GLM embedding-3 支持一次传入多条 `input`，单次请求完成批量向量化——在入库阶段（一篇文档几百个 chunk）这是数量级的性能差异：

```typescript
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,           // 一次传多条
  });
  // API 返回的 data 带 index 字段，显式排序保险
  return response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}
```

**注意**：返回的 `data` 数组理论上按 `index` 升序，但显式 `sort` 是防御性写法——一旦顺序错乱，文本与向量错配会让整个向量库语义错位且极难排查。

## 🛠️ 在 Agent 架构中的作用

- **RAG 的地基**：没有 Embedding 就没有语义检索，RAG 退化为关键词匹配。Embedding 把"语义相关"变成可计算的距离，是 Agent 拥有"语义记忆"的前提。
- **语义检索的基础**：向量库的 `search` 本质是"把 query 向量化 → 与所有记录算余弦相似度 → 取 topK"。这个流程的每一步都依赖 Embedding 提供的向量表示。
- **Stage 3 滑动窗口截断的"外部记忆"替代方案**：Stage 3 用滑动窗口截断历史消息，本质是"工作记忆装不下就丢弃旧消息"——Agent 会忘记早期信息。Embedding 让 Agent 能把信息存到外部向量库，需要时按语义召回，从"丢弃记忆"升级为"检索记忆"，突破上下文窗口的硬上限。

## 🔗 相关代码落地

- [Stage 4 · Step 1 - Embedding 初体验](../stages/stage-04/step-01.md)（句子对相似度排序验证语义距离可被量化）

## 🧩 关联概念

- [余弦相似度](./cosine-similarity.md) —— 比 Embedding 向量的核心度量
- [RAG（检索增强生成）](./rag.md) —— Embedding 是 RAG 检索环节的底层机制
- [文本分块（Chunking）](./chunking.md) —— 分块后的片段才是 Embedding 的输入单元

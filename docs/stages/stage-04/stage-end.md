# Stage 4 总结

> 本阶段从"易失的工作记忆"走向"可检索的长期记忆"——手写 Embedding、分块、向量库与 RAG 闭环，让 Agent 能从外部知识库中"召回"相关信息，突破 Stage 3 滑动窗口截断的硬上限。

## 完整流水线

```
                     📦 入库（一次性，花钱）                    🔍 查询（每次，不花钱）
                     ─────────────────────                    ─────────────────────

Step 3              Step 2            Step 1            Step 4            Step 5
洗菜                撕纸条             贴坐标            归档入库           翻抽屉 + 答题
──────              ──────            ──────            ──────            ──────────
PDF/文档            切成 400 字/块    每块 → 2048维向量  [文本,向量] 对      问题 → 向量
  │                   │                  │              存进 JSON 文件       → 比一圈相似度
  ▼                   ▼                  ▼                 │                 → 取 top3 纸条
去空格/换行          邻块重叠 60 字    调 Embedding API     ▼                 → 拼进 Prompt
去页眉碎片          防句子被切断       花钱的一步         落盘持久化          → LLM 照纸条回答
                                                                            → 没有就说不知道

                     └────────────────── 汇入 Step 4 向量库 ─────────────────┘
                                                   │
                                                   ▼
                                           Step 6: 交互式命令行
                                           /ingest 导入 | /ask 提问 | /exit 退出
```

**两次花钱，一次管够**：入库时向量化花钱（N 次 Embedding API），持久化落盘后查询不花钱（1 次 Embedding + 纯内存算相似度 + LLM 生成）。

## 六步阶梯

```
Step 1 ─── "语义坐标"              Embedding：文本 → 2048 维向量，余弦相似度量化语义距离
    │                               ⚠️ SDK v6 默认 encoding_format=base64，须显式设为 float
    ▼
Step 2 ─── "切分知识"              文本分块：固定长度 + 重叠窗口，三指标评判（准确率/完整度/区分度）
    │                              甜点区 300-500 字，太碎分数虚高但不可用，太粗信号被稀释
    ▼
Step 3 ─── "清洗入口"              PDF 解析 + 文本清洗：脏文档（14.3% 垃圾）→ 净文档 → 区分度 +42%
    │                              Garbage In, Garbage Out 的量化证明
    ▼
Step 4 ─── "持久记忆"              手写向量库：[文本, 向量] 对 + JSON 持久化 + 首次构建 vs 缓存加载对比
    │                              持久化闭环：第二次 1ms 加载 vs 首次 ~2-5s 构建，快 2000 倍
    ▼
Step 5 ─── "开卷考试"              RAG 闭环：检索 topK → 拼 Prompt → LLM 照纸条回答，没有就说不知道
    │                              System Prompt 约束是防幻觉的唯一防线
    ▼
Step 6 ─── "问答系统"              交付物：/ingest 导入 + /ask 问答 + /list 查看 + 跨进程持久化
```

每一步建立在上一层之上，**Step 6 的 `pdf-qa-agent.ts` 整合了前五步的全部能力**，是本阶段的终极交付物。`_shared/` 共享模块是 Step 1-4 能力的"提炼版"，Step 5-6 在其上构建。

## 代码资产

| 文件 | 核心能力 |
|------|---------|
| `_shared/embedding.ts` | Embedding 向量化（单条/批量）+ 余弦相似度 |
| `_shared/chunker.ts` | 文本分块（固定长度 + 重叠窗口） |
| `_shared/pdf-parser.ts` | PDF/txt/md 解析 + 文本清洗 + 统一入口 |
| `_shared/vector-store.ts` | 手写向量库（入库/检索/持久化/清空） |
| `step-01/embedding-basics.ts` | Embedding 初体验（三组相似度对比实验） |
| `step-02/chunking.ts` | 分块参数对比实验（粒度对检索的影响） |
| `step-03/parse-pdf.ts` | PDF 解析 + 清洗前后对比 |
| `step-04/vector-store.ts` | 手写向量库（内联实现 + 持久化验证） |
| `step-05/rag-query.ts` | RAG 闭环（域内/域外问题对比） |
| `step-06/pdf-qa-agent.ts` | 🎯 最终交付物：本地 PDF 语义问答系统 |
| `common/config.ts` | Chat Provider 切换 + Embedding 解耦 + `validateEmbeddingConfig()` 启动前校验 |

## 沉淀的概念文档

| 分类 | 文档 |
|------|------|
| RAG | [Embedding 与向量化](../concepts/rag/embedding.md) · [余弦相似度](../concepts/rag/cosine-similarity.md) · [文本分块](../concepts/rag/chunking.md) · [RAG 检索增强生成](../concepts/rag/rag.md) |

## 三条核心认知

> **1. Embedding 把"语义"变成了"几何"——找相关内容就是找最近的向量。** 文本经过 Embedding 变成高维向量后，"语义相近"这个模糊概念变成了"余弦相似度高"这个可计算的数值。这是 RAG 的地基：没有向量化，就没有语义检索。

> **2. RAG 的本质是"开卷考试"——不让模型凭记忆答，让它查资料答。** 检索 topK 片段拼进 Prompt，System Prompt 约束"只根据资料回答"，模型从"可能幻觉"变成"有据可查"。但前提是检索质量过关——垃圾检索进，垃圾回答出。

> **3. 向量库是 Agent 的"外部长期记忆"，突破了上下文窗口的硬上限。** Stage 3 的滑动窗口截断让 Agent 忘了早期信息——那是"易失的工作记忆"。向量库让 Agent 能从外部知识中"召回"相关内容，按需加载，不受窗口限制。从"记住所有"到"检索所需"，这是 Agent 记忆架构的质变。

## 关键工程经验

- **向量化是最贵的操作，持久化是必须的**：索引一次，多次查询。不要每次启动都重新索引。
- **Embedding 配置完全独立于 Chat**：`config.ts` 采用 Chat 与 Embedding 完全解耦的设计——`LLM_PROVIDER`（glm | deepseek）只管 Chat，`EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL` 三件套独立控制 Embedding。代码内置 `validateEmbeddingConfig()` 启动前校验，配置缺失会在入口立即报错并打印推荐方案，不会再等到 API 调用才发现问题。
- **DeepSeek 不提供 Embedding**：DeepSeek 官方 API 只暴露 `deepseek-v4-flash` / `deepseek-v4-pro` 两个对话模型，`/embeddings` 端点返回 404。因此如果选用 DeepSeek 做 Chat，Embedding 必须通过 `EMBEDDING_*` 指向第三方服务（如智谱 GLM embedding-3 或 SiliconFlow bge-m3）。
- **pdf-parse 无官方类型声明**：需自建 `.d.ts` 文件，否则 `tsc --noEmit` 报 TS7016。
- **分块粒度是检索精度的旋钮**：300-500 字符是甜点区，太粗检索不准，太细丢失上下文。
- **线性扫描 O(N×D) 够用于小数据集**：几百条记录毫秒级完成；十万条以上需 ANN 索引（Stage 5+ 主题）。

## 下一阶段

**Stage 5（高级 RAG 与 Skills 编排）**：Stage 4 的 RAG 能跑，但检索质量有瓶颈——固定长度分块可能在句子中间断裂，单次检索可能引入噪声。Stage 5 引入**重排序**（对初筛结果二次精排）与**查询重写**（把用户口语化问题改写为检索友好的表述），目标准确率提升 30%。同时将复杂工作流打包为 Skills（SOP 封装），从"单步 RAG"走向"多步 RAG 管线"。

---

← 阶段规划：[stage-begin.md](./stage-begin.md)

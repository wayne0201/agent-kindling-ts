/**
 * Stage 4 共享模块：Embedding 向量化
 *
 * 封装 Embedding API（OpenAI 兼容 /embeddings 接口），
 * 提供单条/批量文本向量化，以及余弦相似度计算。
 *
 * Embedding 配置独立于 Chat，通过 EMBEDDING_API_KEY / EMBEDDING_BASE_URL / EMBEDDING_MODEL
 * 环境变量设置，支持任意 OpenAI 兼容的 Embedding 服务。
 */
import OpenAI from 'openai';
import {
  EMBEDDING_API_KEY,
  EMBEDDING_BASE_URL,
  EMBEDDING_MODEL,
  validateEmbeddingConfig,
} from '../../common/config.js';

// 模块加载时立即校验 Embedding 配置，确保启动时就能发现问题
validateEmbeddingConfig();

const client = new OpenAI({ apiKey: EMBEDDING_API_KEY, baseURL: EMBEDDING_BASE_URL });

/**
 * 单条文本 → 向量
 * 注意：OpenAI SDK v6 默认 encoding_format 为 base64，
 *       但 GLM 等第三方 API 返回 JSON float 数组，必须显式指定 float。
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    encoding_format: 'float',
  });
  return response.data[0].embedding;
}

/**
 * 批量文本 → 向量数组
 * GLM embedding-3 支持一次传入多条 input，比逐条调用快得多。
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    encoding_format: 'float',
  });
  // API 返回的 data 按 index 排序，保险起见显式排序
  return response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/**
 * 余弦相似度：衡量两个向量的"方向"一致性，范围 [-1, 1]。
 * 值越接近 1，语义越相近；越接近 0，越不相关。
 *
 * 公式：cos(θ) = (A·B) / (|A| × |B|)
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

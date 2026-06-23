/**
 * Stage 4 · Step 1: Embedding 初体验 —— 把文本变成向量
 *
 * 【学习目标】
 *   理解 Embedding 的本质：文本 → 高维向量，语义相近的文本向量也相近。
 *   调用智谱 GLM 的 embedding-3 模型，把句子变成 2048 维向量，
 *   用余弦相似度验证"语义距离"可以被量化。
 *
 * 【核心认知】
 *   Embedding 是 RAG 的地基——没有向量化，就没有语义检索。
 *   余弦相似度衡量的是向量"方向"的一致性，不是绝对距离。
 *
 * 本步自包含（不依赖 _shared），让你看清最原始的 API 调用。
 */
import OpenAI from 'openai';
import {
  EMBEDDING_API_KEY,
  EMBEDDING_BASE_URL,
  EMBEDDING_MODEL,
  validateEmbeddingConfig,
} from '../../common/config.js';

// 启动时校验 Embedding 配置（本步自包含，不走 _shared，需单独校验）
validateEmbeddingConfig();

const client = new OpenAI({ apiKey: EMBEDDING_API_KEY, baseURL: EMBEDDING_BASE_URL });

// ── 余弦相似度（内联实现，Step 5 起改用 _shared/embedding.ts） ──

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── 单条文本向量化 ──

async function embed(text: string): Promise<number[]> {
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    encoding_format: 'float',
  });
  return response.data[0].embedding;
}

// ── 实验设计 ──
// 三组句子对，预期相似度：同义 > 相关 > 无关

const sentencePairs = [
  {
    a: '猫是一种可爱的宠物，很多人喜欢养猫。',
    b: '小猫很讨人喜欢，是受欢迎的伴侣动物。',
    expect: '同义（高相似度）',
  },
  {
    a: '猫是一种可爱的宠物，很多人喜欢养猫。',
    b: '狗是人类的好朋友，忠诚且容易训练。',
    expect: '相关（中等相似度）',
  },
  {
    a: '猫是一种可爱的宠物，很多人喜欢养猫。',
    b: '今天股市大涨，上证指数突破 3500 点。',
    expect: '无关（低相似度）',
  },
];

// ── 主流程 ──

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(`📐 Stage 4 · Step 1: Embedding 初体验`);
  console.log(`   模型: ${EMBEDDING_MODEL}`);
  console.log('═══════════════════════════════════════════');

  // 1. 先看一个向量长什么样
  console.log('\n🔬 实验 0：把一句话变成向量');
  const sampleText = '大语言模型是人工智能的重要分支。';
  const sampleVec = await embed(sampleText);
  console.log(`  输入: "${sampleText}"`);
  console.log(`  向量维度: ${sampleVec.length}`);
  console.log(`  前 5 维: [${sampleVec.slice(0, 5).map((v) => v.toFixed(4)).join(', ')}]`);
  console.log(`  → 一句话变成了 ${sampleVec.length} 个浮点数，这就是"语义的坐标"`);

  // 2. 三组对比实验
  console.log('\n🔬 实验 1-3：语义距离可以被量化');
  console.log('   预期：同义 > 相关 > 无关\n');

  for (let i = 0; i < sentencePairs.length; i++) {
    const { a, b, expect } = sentencePairs[i];
    const [vecA, vecB] = await Promise.all([embed(a), embed(b)]);
    const score = cosineSimilarity(vecA, vecB);

    console.log(`── 实验 ${i + 1}: ${expect} ──`);
    console.log(`  A: ${a}`);
    console.log(`  B: ${b}`);
    console.log(`  余弦相似度: ${score.toFixed(4)}`);
    console.log('');
  }

  // 3. 小结
  console.log('═══════════════════════════════════════════');
  console.log('💡 小结：');
  console.log('   🔹 Embedding = 文本 → 高维向量（语义的坐标）');
  console.log(`      GLM embedding-3 输出 ${sampleVec.length} 维向量`);
  console.log('   🔹 余弦相似度 = 衡量两个向量"方向"的一致性 ∈ [-1, 1]');
  console.log('      越接近 1 → 语义越相近；越接近 0 → 越不相关');
  console.log('   🔹 关键洞察：语义距离被量化了！');
  console.log('      这意味着"找最相关的内容"变成了"找最近的向量"——向量检索的基础');
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);

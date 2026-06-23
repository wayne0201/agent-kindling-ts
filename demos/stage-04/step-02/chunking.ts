/**
 * Stage 4 · Step 2: 文本分块（Chunking）—— 从切分到检索，完整对比实验
 *
 * 【学习目标】
 *   1. 理解为什么 RAG 需要分块，实现"固定长度 + 重叠窗口"策略
 *   2. 观察 chunkSize / overlap 如何影响切分形态
 *   3. **核心实验**：同样文档 × 同样 query × 三种分块策略 → 对比检索质量
 *   4. 建立"好分块"的评判标准：不是分数高，而是正确答案排进 topK
 *
 * 【评判标准】
 *   分块好不好，不看相似度绝对值，看三条：
 *     ✅ 准确率：正确答案的 chunk 在不在 top-3？
 *     ✅ 完整度：chunk 包含足够上下文让 LLM 能回答吗？
 *     ✅ 区分度：相关 chunk 和不相关 chunk 的分数拉开差距了吗？
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getEmbedding, getEmbeddings, cosineSimilarity } from '../_shared/embedding.js';

// ── 分块实现 ──

interface Chunk {
  id: number;
  text: string;
  start: number;
  end: number;
}

function splitText(text: string, chunkSize: number, overlap: number): Chunk[] {
  const cleaned = text.replace(/\r\n/g, '\n');
  const chunks: Chunk[] = [];
  let start = 0;
  let id = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push({ id: id++, text: cleaned.slice(start, end), start, end });
    if (end >= cleaned.length) break;
    start = end - overlap;
  }
  return chunks;
}

// ── 可视化 ──

function printChunkPreview(chunks: Chunk[], label: string, maxLines = 5): void {
  console.log(`\n📋 ${label}（共 ${chunks.length} 块）`);
  console.log('─'.repeat(60));
  const show = chunks.slice(0, maxLines);
  show.forEach((c) => {
    const preview = c.text.replace(/\n/g, '⏎').slice(0, 65);
    console.log(`  [${c.id}] (${c.start}-${c.end}) ${preview}${c.text.length > 65 ? '...' : ''}`);
  });
  if (chunks.length > maxLines) console.log(`  ... 还有 ${chunks.length - maxLines} 块`);
}

// ── 检索质量评估 ──

interface Strategy {
  name: string;
  chunkSize: number;
  overlap: number;
}

interface EvalResult {
  strategy: string;
  topK: { rank: number; score: number; preview: string }[];
  /** top-3 里有没有包含「正确关键词」的 chunk */
  correctInTop3: boolean;
  /** top-1 的内容是否包含足够上下文 */
  top1Complete: boolean;
  /** top-1 和 top-3 的分数差距 */
  scoreGap: number;
}

async function evaluate(
  query: string,
  keywords: string[],
  strategy: Strategy,
  text: string,
): Promise<EvalResult> {
  const chunks = splitText(text, strategy.chunkSize, strategy.overlap);
  const embeddings = await getEmbeddings(chunks.map((c) => c.text));
  const qVec = await getEmbedding(query);

  const ranked = chunks
    .map((c, i) => ({
      rank: 0,
      score: cosineSimilarity(qVec, embeddings[i]),
      preview: c.text.replace(/\n/g, ' ').slice(0, 90),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r, i) => ({ ...r, rank: i + 1 }));

  // 评判：top-3 中是否有片段包含正确答案的关键词
  const correctInTop3 = ranked.some((r) =>
    keywords.some((kw) => r.preview.includes(kw)),
  );

  // 评判：top-1 的内容长度是否足够（≥ 200 字符才算有完整上下文）
  const top1Text = chunks.find((c, i) => {
    const s = cosineSimilarity(qVec, embeddings[i]);
    return s === ranked[0].score;
  })?.text ?? '';
  const top1Complete = top1Text.length >= 200;

  const scoreGap = ranked.length >= 3 ? ranked[0].score - ranked[2].score : 0;

  return {
    strategy: strategy.name,
    topK: ranked,
    correctInTop3,
    top1Complete,
    scoreGap,
  };
}

// ── 综合得分 ──

function overallScore(r: EvalResult): string {
  const checks: string[] = [];
  if (r.correctInTop3) checks.push('✅ 准确：正确答案在 top-3');
  else checks.push('❌ 失准：正确答案不在 top-3');
  if (r.top1Complete) checks.push('✅ 完整：top-1 上下文充足');
  else checks.push('⚠️ 碎片：top-1 太短，LLM 无法回答');
  if (r.scoreGap > 0.05) checks.push('✅ 区分：相关/不相关分数拉开');
  else checks.push('⚠️ 模糊：分数挤在一起，区分度差');

  return checks.join('\n       ');
}

// ── 主流程 ──

const KNOWLEDGE_FILE = path.resolve(import.meta.dirname, '../knowledge/llm-handbook.txt');

const STRATEGIES: Strategy[] = [
  { name: '太碎  chunkSize=100  overlap=0', chunkSize: 100, overlap: 0 },
  { name: '甜点  chunkSize=400  overlap=60', chunkSize: 400, overlap: 60 },
  { name: '太粗  chunkSize=1500 overlap=0', chunkSize: 1500, overlap: 0 },
];

const TEST_CASES = [
  {
    query: 'Function Calling 的四个步骤是什么？',
    keywords: ['Function Calling', '流程分四步', 'tool_calls'],
  },
  {
    query: '什么是上下文窗口？它为什么重要？',
    keywords: ['上下文窗口', 'Context Window', '最大 token'],
  },
  {
    query: 'RAG 解决什么核心问题？',
    keywords: ['检索增强生成', '私域数据', '查资料回答'],
  },
];

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('✂️  Stage 4 · Step 2: 文本分块完整实验');
  console.log('═══════════════════════════════════════════');

  const rawText = fs.readFileSync(KNOWLEDGE_FILE, 'utf-8');
  console.log(`\n📄 知识库: ${path.basename(KNOWLEDGE_FILE)}（${rawText.length} 字符）`);

  // ── 第一部分：切分形态对比 ──
  console.log('\n' + '═'.repeat(60));
  console.log('第一部分：切出来的 chunk 长什么样？');
  console.log('═'.repeat(60));

  for (const s of STRATEGIES) {
    const chunks = splitText(rawText, s.chunkSize, s.overlap);
    printChunkPreview(chunks, s.name);
  }

  // ── 第二部分：检索质量对比 ──
  console.log('\n' + '═'.repeat(60));
  console.log('第二部分：同样的 query，检索结果有何不同？');
  console.log('═'.repeat(60));

  const allResults: { query: string; results: EvalResult[] }[] = [];

  for (const tc of TEST_CASES) {
    console.log(`\n❓ "${tc.query}"\n`);

    const results: EvalResult[] = [];
    for (const s of STRATEGIES) {
      const r = await evaluate(tc.query, tc.keywords, s, rawText);
      results.push(r);

      console.log(`┌─ ${s.name}（${splitText(rawText, s.chunkSize, s.overlap).length} 块）`);
      r.topK.forEach((item) => {
        const bar = '█'.repeat(Math.round(item.score * 25));
        console.log(`│ [${item.rank}] ${item.score.toFixed(4)} ${bar}`);
        console.log(`│     ${item.preview}...`);
      });
      console.log(`│`);
      console.log(`│ 评判: ${overallScore(r).replace(/\n/g, '\n│       ')}`);
      console.log('└' + '─'.repeat(55) + '\n');
    }

    allResults.push({ query: tc.query, results });
  }

  // ── 第三部分：总结评判 ──
  console.log('═'.repeat(60));
  console.log('第三部分：哪种策略更好？');
  console.log('═'.repeat(60));

  console.log('\n综合评判表：\n');
  console.log('│ 策略              │ 准确率 │ 完整度 │ 区分度 │ 综合   │');
  console.log('│───────────────────│────────│────────│────────│────────│');

  for (const s of STRATEGIES) {
    const relevant = allResults.flatMap((a) => a.results.filter((r) => r.strategy === s.name));
    const acc = relevant.filter((r) => r.correctInTop3).length;
    const comp = relevant.filter((r) => r.top1Complete).length;
    const gap = (relevant.reduce((sum, r) => sum + r.scoreGap, 0) / relevant.length).toFixed(4);

    const accMark = acc === 3 ? '✅ 3/3' : acc === 2 ? '⚠️ 2/3' : '❌ ' + acc + '/3';
    const compMark = comp === 3 ? '✅ 3/3' : comp === 2 ? '⚠️ 2/3' : '❌ ' + comp + '/3';
    const gapMark = Number(gap) > 0.05 ? '✅ ' + gap : '⚠️ ' + gap;

    const verdict = acc === 3 && comp >= 2 ? '🏆 最佳' : acc === 0 ? '❌ 不可用' : '⚠️ 勉强';
    console.log(`│ ${s.name.padEnd(18)}│ ${accMark.padEnd(7)}│ ${compMark.padEnd(7)}│ ${gapMark.padEnd(7)}│ ${verdict.padEnd(7)}│`);
  }
  console.log('');

  console.log('💡 核心认知：');
  console.log('   🔹 "好分块"不看分数绝对值，看三件事：');
  console.log('      ① 正确答案的 chunk 在不在 top-3？（准确率）');
  console.log('      ② chunk 有没有足够上下文？（完整度，≥ 200 字）');
  console.log('      ③ 相关/不相关的分数拉开差距了吗？（区分度）');
  console.log('   🔹 短 chunk 分数高是陷阱——内容碎片化，LLM 无法回答');
  console.log('   🔹 长 chunk 分数低是稀释——多个主题混杂，检索不精准');
  console.log('   🔹 甜点区（300-500 字）在三项指标上都平衡');
  console.log('   🔹 实际项目调参：准备 5 个已知答案的 query，跑这个评测流程');
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);

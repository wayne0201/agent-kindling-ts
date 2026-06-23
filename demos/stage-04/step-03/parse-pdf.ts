/**
 * Stage 4 · Step 3: PDF 解析与文本清洗
 *
 * 【学习目标】
 *   亲眼看到：脏文本 → 分块 → 向量化 → 检索  vs  干净文本 → 分块 → 向量化 → 检索
 *   同样的 query，清洗前后检索结果完全不同。Garbage In, Garbage Out 不是口号，是可验证的。
 *
 * 【实验设计】
 *   第一部分：脏文档清洗（可视化对比）
 *   第二部分：脏 vs 净 → 同条件检索 → 三指标评判 → 净文档完胜
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseDocument, parseTextFile, cleanText } from '../_shared/pdf-parser.js';
import { splitText } from '../_shared/chunker.js';
import { getEmbedding, getEmbeddings, cosineSimilarity } from '../_shared/embedding.js';

const KNOWLEDGE_DIR = path.resolve(import.meta.dirname, '../knowledge');
const DIRTY_FILE = path.join(KNOWLEDGE_DIR, 'dirty-sample.txt');

// ── 检索 + 评判（同 Step 2 的 evaluate 逻辑）──

interface EvalResult {
  label: string;
  topK: { rank: number; score: number; preview: string; fullText: string }[];
  correctInTop3: boolean;
  top1Complete: boolean;
  scoreGap: number;
  /** 第一个命中关键词的 chunk 的相似度（越高说明检索越"确信"） */
  firstHitScore: number;
}

async function evaluate(
  query: string,
  keywords: string[],
  chunks: { text: string }[],
  label: string,
): Promise<EvalResult> {
  const embeddings = await getEmbeddings(chunks.map((c) => c.text));
  const qVec = await getEmbedding(query);

  const ranked = chunks
    .map((c, i) => ({
      rank: 0,
      score: cosineSimilarity(qVec, embeddings[i]),
      preview: c.text.replace(/\n/g, ' ').slice(0, 80),
      fullText: c.text.replace(/\n/g, ' '),
    }))
    .sort((a, b) => b.score - a.score);

  const top3 = ranked.slice(0, 3).map((r, i) => ({ ...r, rank: i + 1 }));

  // 用完整文本做关键词匹配
  const correctInTop3 = top3.some((r) => keywords.some((kw) => r.fullText.includes(kw)));
  const top1Text = top3[0]?.fullText ?? '';
  const top1Complete = top1Text.length >= 100;
  const scoreGap = top3.length >= 3 ? top3[0].score - top3[2].score : 0;

  // 第一个命中关键词的 chunk 的分数（在全部 chunk 中，不限 top-3）
  const firstHit = ranked.find((r) => keywords.some((kw) => r.fullText.includes(kw)));
  const firstHitScore = firstHit ? firstHit.score : 0;

  return { label, topK: top3, correctInTop3, top1Complete, scoreGap, firstHitScore };
}

// ── 主流程 ──

const QUERIES = [
  { q: 'Agent 的四大核心能力是什么？', kw: ['感知', '推理', '执行', '记忆'] },
  { q: 'RAG 的工作流程分哪两个阶段？', kw: ['离线索引', '在线查询'] },
  { q: 'Function Calling 的步骤是什么？', kw: ['tool_calls', '声明可用工具', '四步'] },
  { q: 'Harness Loop 包含哪五个步骤？', kw: ['当前状态', 'LLM 做决策', '解析', '写回状态'] },
  { q: 'ReAct 模式的核心思想是什么？', kw: ['思考', 'Thought', '行动之前'] },
];

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('📄 Stage 4 · Step 3: PDF 解析与文本清洗');
  console.log('═══════════════════════════════════════════');

  // ════════════════════════════════════════════
  // 第一部分：清洗前后可视化
  // ════════════════════════════════════════════

  if (!fs.existsSync(DIRTY_FILE)) {
    console.log('❌ 未找到 dirty-sample.txt');
    return;
  }

  console.log('\n' + '═'.repeat(55));
  console.log('第一部分：脏文档长什么样？');
  console.log('═'.repeat(55));

  const dirty = parseTextFile(DIRTY_FILE);
  const cleaned = cleanText(dirty);

  console.log(`\n📋 脏文档（${dirty.length} 字符）：`);
  console.log('─'.repeat(55));
  const dirtyPreview = dirty.slice(0, 250)
    .replace(/[ \t]{2,}/g, (m) => `[${m.length}空格]`)
    .replace(/\n{3,}/g, (m) => `[${m.length}换行]\n`);
  console.log(dirtyPreview);
  console.log('   ...');

  console.log(`\n📋 净文档（${cleaned.length} 字符，清除 ${dirty.length - cleaned.length} 个垃圾字符）：`);
  console.log('─'.repeat(55));
  console.log(cleaned.slice(0, 250));
  console.log('   ...');

  const problems = {
    blankLines: (dirty.match(/\n{3,}/g) || []).length,
    spaces: (dirty.match(/[ \t]{2,}/g) || []).length,
  };
  console.log(`\n🐛 脏文档问题: ${problems.blankLines} 处连续空行 + ${problems.spaces} 处连续空格`);

  // ════════════════════════════════════════════
  // 第二部分：检索质量对比
  // ════════════════════════════════════════════

  console.log('\n' + '═'.repeat(55));
  console.log('第二部分：同样 query × 脏净文档 → 检索对比');
  console.log('═'.repeat(55));

  const dirtyChunks = splitText(dirty, 300, 0).map((c) => ({ text: c.text }));
  const cleanChunks = splitText(cleaned, 300, 0).map((c) => ({ text: c.text }));

  console.log(`\n   脏文档 → ${dirtyChunks.length} 个 chunk  |  净文档 → ${cleanChunks.length} 个 chunk`);
  console.log(`   脏文档比净文档多 ${dirtyChunks.length - cleanChunks.length} 个 chunk → 全是垃圾字符撑出来的"噪音块"\n`);

  // 挑选一个"被脏数据切断的句子"做对比
  const brokenSample = 'Agent 的四';
  const dirtyBrokenChunk = dirtyChunks.find((c) => c.text.includes(brokenSample));
  const cleanSameChunk = cleanChunks.find((c) => c.text.includes(brokenSample));

  if (dirtyBrokenChunk && cleanSameChunk) {
    console.log('🔬 关键对比：同一个位置，脏/净 chunk 的内容质量\n');
    console.log(`   脏 chunk（${dirtyBrokenChunk.text.length} 字符）：`);
    console.log(`   "${dirtyBrokenChunk.text.replace(/\n/g, '⏎')}"`);
    console.log(`   ⚠️  垃圾字符挤占了有效内容的空间`);
    console.log('');
    console.log(`   净 chunk（${cleanSameChunk.text.length} 字符）：`);
    console.log(`   "${cleanSameChunk.text.replace(/\n/g, '⏎')}"`);
    console.log(`   ✅ 同样的 150 字符，塞进了更多有效信息\n`);
  }

  const allResults: { query: string; dirty: EvalResult; clean: EvalResult }[] = [];

  for (const { q, kw } of QUERIES) {
    console.log(`❓ "${q}"\n`);

    const [dirtyRes, cleanRes] = await Promise.all([
      evaluate(q, kw, dirtyChunks, '脏'),
      evaluate(q, kw, cleanChunks, '净'),
    ]);

    allResults.push({ query: q, dirty: dirtyRes, clean: cleanRes });

    // 脏文档的检索结果
    console.log('┌─ 脏文档检索 top-3 ────────────────────────────────');
    dirtyRes.topK.forEach((r) => {
      const flag = kw.some((k) => r.fullText.includes(k)) ? ' ✅' : '';
      console.log(`│ [${r.rank}] ${r.score.toFixed(4)} ${'█'.repeat(Math.round(r.score * 20))}${flag}`);
      console.log(`│     ${r.preview}...`);
    });
    console.log('└──────────────────────────────────────────────────');

    // 净文档的检索结果
    console.log('┌─ 净文档检索 top-3 ────────────────────────────────');
    cleanRes.topK.forEach((r) => {
      const flag = kw.some((k) => r.fullText.includes(k)) ? ' ✅' : '';
      console.log(`│ [${r.rank}] ${r.score.toFixed(4)} ${'█'.repeat(Math.round(r.score * 20))}${flag}`);
      console.log(`│     ${r.preview}...`);
    });
    console.log('└──────────────────────────────────────────────────\n');
  }

  // ════════════════════════════════════════════
  // 第三部分：综合评判
  // ════════════════════════════════════════════

  console.log('═'.repeat(55));
  console.log('第三部分：综合评判');
  console.log('═'.repeat(55));

  console.log('\n│          │ 准确率   │ 完整度   │ 区分度    │ 命中分数（↑好）│ 综合    │');
  console.log('│──────────│──────────│──────────│───────────│───────────────│────────│');

  const totalQ = QUERIES.length;

  for (const label of ['脏', '净']) {
    const results = allResults.map((a) => (label === '脏' ? a.dirty : a.clean));
    const acc = results.filter((r) => r.correctInTop3).length;
    const comp = results.filter((r) => r.top1Complete).length;
    const gap = (results.reduce((s, r) => s + r.scoreGap, 0) / results.length).toFixed(4);
    const avgScore = (results.reduce((s, r) => s + r.firstHitScore, 0) / results.length).toFixed(4);

    const accStr = `${acc}/${totalQ}`.padEnd(9);
    const compStr = `${comp}/${totalQ}`.padEnd(9);
    const gapStr = gap.padEnd(10);
    const scoreStr = avgScore.padEnd(14);
    const verdict = acc === totalQ ? '🏆' : acc >= totalQ - 1 ? '⚠️' : '❌';

    console.log(`│ ${label.padEnd(9)}│ ${accStr}│ ${compStr}│ ${gapStr}│ ${scoreStr}│ ${verdict.padEnd(7)}│`);
  }
  console.log('');

  // ════════════════════════════════════════════
  // 第四部分：统一入口
  // ════════════════════════════════════════════

  console.log('═'.repeat(55));
  console.log('附：parseDocument 统一入口');
  console.log('═'.repeat(55));

  const files = fs.readdirSync(KNOWLEDGE_DIR);
  const pdfFile = files.find((f) => f.endsWith('.pdf'));
  const txtFile = files.find((f) => f.endsWith('.txt') && f !== 'dirty-sample.txt');

  let targetFile: string;
  if (pdfFile) {
    targetFile = path.join(KNOWLEDGE_DIR, pdfFile);
    console.log(`\n📂 PDF: ${pdfFile}`);
  } else if (txtFile) {
    targetFile = path.join(KNOWLEDGE_DIR, txtFile);
    console.log(`\n📂 txt: ${txtFile}`);
  } else {
    return;
  }

  const finalText = await parseDocument(targetFile);
  console.log(`   parseDocument → ${finalText.length} 字符（已清洗）`);

  // 小结
  console.log('\n═══════════════════════════════════════════');
  console.log('💡 小结：');
  console.log(`   🔹 脏文档 = ${dirty.length} 字符，含 ${problems.blankLines} 处连续空行 + ${problems.spaces} 处连续空格`);
  console.log(`   🔹 清洗后 = ${cleaned.length} 字符，清除 ${dirty.length - cleaned.length} 个垃圾字符（${(((dirty.length - cleaned.length) / dirty.length) * 100).toFixed(1)}%）`);
  console.log(`   🔹 脏文档 ${dirtyChunks.length} 个 chunk → 净文档 ${cleanChunks.length} 个 chunk → 少 ${dirtyChunks.length - cleanChunks.length} 个噪音块`);
  console.log('   🔹 命中分数（越高说明检索越"确信"正确答案）：');
  const dAvg = (allResults.reduce((s, a) => s + a.dirty.firstHitScore, 0) / allResults.length).toFixed(4);
  const cAvg = (allResults.reduce((s, a) => s + a.clean.firstHitScore, 0) / allResults.length).toFixed(4);
  console.log(`      脏文档: ${dAvg}  |  净文档: ${cAvg}  |  差距: ${(Number(cAvg) - Number(dAvg)).toFixed(4)}`);
  if (Number(cAvg) > Number(dAvg)) {
    console.log('      ✅ 净文档的检索信号始终更强');
  }
  console.log('   🔹 垃圾字符 → 稀释相似度 → 检索信号变弱 → 答案排不进 topK');
  console.log('   🔹 想象 10 万字 PDF：垃圾字符 1 万 → 噪音块 100+ → 检索大面积失效');
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);

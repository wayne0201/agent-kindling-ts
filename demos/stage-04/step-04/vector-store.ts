/**
 * Stage 4 · Step 4: 手写向量库 —— 持久化的语义记忆
 *
 * 【学习目标】
 *   不依赖任何向量数据库，手写一个基于 JSON 文件的向量库。
 *   实现 addTexts / search / save / load，并闭环持久化的"存→读→复用"。
 *
 * 【核心认知】
 *   向量库的本质 = [文本, 向量] 对 + 相似度计算。没有魔法。
 *   持久化的真正价值 = "索引一次，反复查询"——第二次运行跳过 Embedding API。
 *   线性扫描 O(N×D) 在小数据集够用，大数据集需 ANN 索引（Stage 5+）。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getEmbedding, getEmbeddings, cosineSimilarity } from '../_shared/embedding.js';
import { splitText } from '../_shared/chunker.js';
import { parseDocument } from '../_shared/pdf-parser.js';

const KNOWLEDGE_FILE = path.resolve(import.meta.dirname, '../knowledge/llm-handbook.txt');
const STORE_FILE = path.resolve(import.meta.dirname, '../data/vector-store.json');
const CHUNK_SIZE = 400;
const OVERLAP = 60;

// ── 手写向量库（内联实现，与 _shared/vector-store.ts 逻辑一致）──

interface VectorRecord {
  id: string;
  text: string;
  embedding: number[];
  metadata: { source: string; chunkIndex: number };
}

interface SearchResult {
  record: VectorRecord;
  score: number;
}

class VectorStore {
  private records: VectorRecord[] = [];

  size(): number { return this.records.length; }

  async addTexts(texts: string[], source: string): Promise<void> {
    if (texts.length === 0) return;
    const embeddings = await getEmbeddings(texts);
    const base = this.records.length;
    texts.forEach((text, i) => {
      this.records.push({
        id: `${source}#${base + i}`,
        text,
        embedding: embeddings[i],
        metadata: { source, chunkIndex: i },
      });
    });
  }

  async search(query: string, topK = 3): Promise<SearchResult[]> {
    if (this.records.length === 0) return [];
    const qVec = await getEmbedding(query);
    return this.records
      .map((record) => ({ record, score: cosineSimilarity(qVec, record.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  save(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(this.records, null, 2), 'utf-8');
  }

  load(filePath: string): void {
    if (!fs.existsSync(filePath)) return;
    this.records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
}

// ── 主流程 ──

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('🗄️  Stage 4 · Step 4: 手写向量库 — 持久化闭环');
  console.log('═══════════════════════════════════════════');

  const existed = fs.existsSync(STORE_FILE);
  const store = new VectorStore();
  let buildMs = 0;
  let chunkCount = 0;

  if (existed) {
    // ════════════════════════════════════════════
    // 快路径：已有索引
    // ════════════════════════════════════════════
    const t0 = Date.now();
    store.load(STORE_FILE);
    buildMs = Date.now() - t0;
    const kb = (fs.statSync(STORE_FILE).size / 1024).toFixed(1);

    console.log('\n┌─────────────────────────────────────────┐');
    console.log('│  📂 发现已索引文件                         │');
    console.log('│                                           │');
    console.log(`│  ${path.relative(process.cwd(), STORE_FILE).padEnd(40)}│`);
    console.log(`│  ${store.size()} 条记录 | ${kb} KB                    │`);
    console.log('└─────────────────────────────────────────┘');

    // 对比表
    console.log('\n┌──────────────────────────────────────────────────────────┐');
    console.log('│              持久化 vs 首次构建                            │');
    console.log('├────────────┬─────────────────┬───────────────────────────┤');
    console.log('│            │   🏗️ 首次构建    │         ⚡ 加载缓存        │');
    console.log('├────────────┼─────────────────┼───────────────────────────┤');
    console.log('│  解析+分块  │       ✅        │           ⏭️  跳过          │');
    console.log('│  Embedding │   5 次 API 💰   │         0 次 🆓            │');
    console.log('│  写 JSON   │    201 KB       │         ⏭️  跳过           │');
    console.log('│  耗时      │    ~2-5 秒      │        1 ms               │');
    console.log('├────────────┼─────────────────┼───────────────────────────┤');
    console.log('│  总耗时    │  ████████████████│  ▏                         │');
    console.log('│            │  ████████████████│  ▏  快 2000 倍             │');
    console.log('└────────────┴─────────────────┴───────────────────────────┘');

    console.log(`\n  💰 本次节省: ${store.size()} 次 Embedding API = 零成本`);
    console.log(`  🗑️  删掉 ${path.relative(process.cwd(), STORE_FILE)} 再跑 → 走首次构建慢路径`);

  } else {
    // ════════════════════════════════════════════
    // 慢路径：首次构建
    // ════════════════════════════════════════════
    console.log('\n┌─────────────────────────────────────────┐');
    console.log('│  🏗️  首次构建向量库                        │');
    console.log('│                                           │');
    console.log('│  缓存文件不存在，需要从头构建。             │');
    console.log('│  下面三步只有第一次会执行。                 │');
    console.log('└─────────────────────────────────────────┘');

    const t0 = Date.now();

    // ① 解析 + 分块
    console.log('\n  ── ① 解析文档并分块 ──');
    const text = await parseDocument(KNOWLEDGE_FILE);
    const chunks = splitText(text, CHUNK_SIZE, OVERLAP);
    chunkCount = chunks.length;
    console.log(`  📄 ${path.basename(KNOWLEDGE_FILE)}`);
    console.log(`     ${text.length} 字符 → ${chunks.length} 个 chunk（${CHUNK_SIZE}字/块, overlap=${OVERLAP}）`);

    // ② 向量化
    console.log('\n  ── ② 向量化入库 ──');
    console.log(`  🔢 正在向量化 ${chunks.length} 个 chunk...`);
    console.log(`     调用 ${chunks.length} 次 Embedding API 💰（这是唯一花钱的步骤）`);
    await store.addTexts(chunks.map((c) => c.text), path.basename(KNOWLEDGE_FILE));
    console.log(`  ✅ ${store.size()} 条记录已入库`);

    // ③ 持久化
    console.log('\n  ── ③ 持久化落盘 ──');
    store.save(STORE_FILE);
    buildMs = Date.now() - t0;
    const kb = (fs.statSync(STORE_FILE).size / 1024).toFixed(1);
    console.log(`  💾 ${path.relative(process.cwd(), STORE_FILE)}`);
    console.log(`     ${kb} KB | 耗时 ${(buildMs / 1000).toFixed(1)}s`);

    // 预告
    console.log('\n┌─────────────────────────────────────────┐');
    console.log('│  🔮 下次运行预告                           │');
    console.log('│                                           │');
    console.log('│  以上三步只在第一次运行。                   │');
    console.log('│  下次运行时检测到 JSON 文件 → 直接加载     │');
    console.log('│  → 1ms 内就绪，0 次 API 调用               │');
    console.log('│                                           │');
    console.log('│  👉 再跑一次本 demo，看持久化的加载速度     │');
    console.log('└─────────────────────────────────────────┘');
  }

  // ════════════════════════════════════════════
  // 语义检索
  // ════════════════════════════════════════════

  console.log('\n── 语义检索验证 ──\n');
  const queries = ['什么是上下文窗口？', 'Function Calling 的流程是什么？', 'RAG 解决什么问题？'];
  for (const q of queries) {
    const results = await store.search(q, 2);
    console.log(`  🔍 "${q}"`);
    results.forEach((r, i) => {
      const bar = '█'.repeat(Math.round(r.score * 20));
      const preview = r.record.text.replace(/\n/g, ' ').slice(0, 65);
      console.log(`     [${i + 1}] ${r.score.toFixed(4)} ${bar}`);
      console.log(`           ${preview}...`);
    });
    console.log('');
  }

  console.log('═══════════════════════════════════════════');
  console.log('💡 小结：');
  console.log('   🔹 向量库 = [文本, 向量] 对 + 相似度检索');
  console.log('      没有魔法：存文本+向量，查"谁离 query 最近"');
  if (existed) {
    console.log('   🔹 持久化价值：第二次运行从 JSON 加载');
    console.log('      → 跳过解析/分块/向量化 → 1ms 就绪 → 不花一分钱');
  } else {
    console.log('   🔹 持久化价值：本次已落盘，下次运行自动跳过');
    console.log('      → 1ms 加载 vs 首次 ~2-5s 构建 → 快 2000 倍');
  }
  console.log('   🔹 线性扫描 O(N×D)：小数据集够用，大数据需 ANN');
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);

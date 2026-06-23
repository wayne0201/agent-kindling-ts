/**
 * Stage 4 · Step 6: 交付物 —— 本地 PDF 语义问答脚本
 *
 * 【目标】
 *   整合 Step 1-5 全部能力，交付一个交互式的本地文档语义问答系统。
 *
 * 【指令】
 *   /ingest <文件路径>   解析 → 分块 → 向量化 → 入库（支持 .pdf/.txt/.md）
 *   /ask <问题>          RAG 检索 + 生成回答（附来源片段）
 *   /list                列出已索引的文档
 *   /reset               清空向量库
 *   /exit                退出（自动持久化）
 *
 * 【整合清单】
 *   ✅ Step 1: Embedding 向量化（_shared/embedding.ts）
 *   ✅ Step 2: 文本分块（_shared/chunker.ts）
 *   ✅ Step 3: PDF 解析与清洗（_shared/pdf-parser.ts）
 *   ✅ Step 4: 向量库（_shared/vector-store.ts）
 *   ✅ Step 5: RAG 闭环（检索 + 生成）
 *
 * 向量库持久化到 data/store.json，跨进程可复用，无需每次重新索引。
 */
import OpenAI from 'openai';
import * as readline from 'node:readline/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { API_KEY, BASE_URL, MODEL, PROVIDER_NAME } from '../../common/config.js';
import { VectorStore, type SearchResult } from '../_shared/vector-store.js';
import { splitText } from '../_shared/chunker.js';
import { parseDocument } from '../_shared/pdf-parser.js';

const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });

const STORE_FILE = path.resolve(import.meta.dirname, '../data/vector-store.json');
const KNOWLEDGE_DIR = path.resolve(import.meta.dirname, '../knowledge');
const CHUNK_SIZE = 400;
const OVERLAP = 60;
const TOP_K = 3;

// ── RAG 查询 ──

async function ragQuery(store: VectorStore, question: string): Promise<{ answer: string; sources: SearchResult[] }> {
  const sources = await store.search(question, TOP_K);
  if (sources.length === 0) {
    return { answer: '向量库为空，请先用 /ingest 导入文档。', sources: [] };
  }

  const context = sources
    .map((r, i) => `[片段 ${i + 1}]（来源: ${r.record.metadata.source}，相似度: ${r.score.toFixed(3)}）\n${r.record.text}`)
    .join('\n\n');

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `你是一个严谨的问答助手。请根据下方【检索资料】回答用户问题。

规则：
1. 只能基于【检索资料】回答，不要编造资料中没有的内容。
2. 如果【检索资料】中没有答案，明确回答"根据已有资料无法回答该问题"。
3. 回答末尾标注引用的片段编号。

【检索资料】
${context}`,
    },
    { role: 'user', content: question },
  ];

  const response = await client.chat.completions.create({ model: MODEL, messages });
  return { answer: response.choices[0].message.content ?? '', sources };
}

// ── 导入文档 ──

async function ingest(store: VectorStore, filePath: string): Promise<void> {
  // 支持相对路径（相对于 knowledge/ 目录）和绝对路径
  let absPath = filePath;
  if (!path.isAbsolute(filePath)) {
    absPath = path.resolve(KNOWLEDGE_DIR, filePath);
  }
  if (!fs.existsSync(absPath)) {
    console.log(`❌ 文件不存在: ${absPath}`);
    return;
  }

  const sourceName = path.basename(absPath);
  console.log(`📄 导入: ${sourceName}`);

  const text = await parseDocument(absPath);
  console.log(`   清洗后字符数: ${text.length}`);

  const chunks = splitText(text, CHUNK_SIZE, OVERLAP);
  console.log(`   分块数: ${chunks.length}（chunkSize=${CHUNK_SIZE}, overlap=${OVERLAP}）`);

  console.log(`   向量化中...`);
  await store.addTexts(chunks.map((c) => c.text), sourceName);
  console.log(`   ✅ 入库完成，当前共 ${store.size()} 条记录`);

  store.save(STORE_FILE);
  console.log(`   💾 已持久化到 ${path.relative(process.cwd(), STORE_FILE)}`);
}

// ── 交互界面 ──

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function printHelp(): void {
  console.log('\n指令:');
  console.log('  /ingest <文件路径>   导入文档（.pdf/.txt/.md，支持相对 knowledge/ 的路径）');
  console.log('  /ask <问题>          基于已索引文档回答问题');
  console.log('  /list                列出已索引文档');
  console.log('  /reset               清空向量库');
  console.log('  /help                显示帮助');
  console.log('  /exit                退出');
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(`📚 本地 PDF 语义问答系统 (${PROVIDER_NAME})`);
  console.log('═══════════════════════════════════════════');

  // 加载已有向量库
  const store = new VectorStore();
  store.load(STORE_FILE);
  if (store.size() > 0) {
    console.log(`📂 已加载向量库: ${store.size()} 条记录，来源: ${store.listSources().join(', ')}`);
  } else {
    console.log('📂 向量库为空，请用 /ingest 导入文档');
    console.log(`   💡 提示: knowledge/ 目录下已有: ${fs.readdirSync(KNOWLEDGE_DIR).join(', ')}`);
    console.log('   快速开始: /ingest llm-handbook.txt');
  }

  printHelp();

  process.on('SIGINT', () => {
    store.save(STORE_FILE);
    console.log('\n👋 再见！');
    rl.close();
    process.exit(0);
  });

  while (true) {
    const input = await rl.question('\nYou> ');
    const trimmed = input.trim();
    if (!trimmed) continue;

    if (trimmed === '/exit') {
      store.save(STORE_FILE);
      console.log('👋 再见！');
      rl.close();
      process.exit(0);
    }

    if (trimmed === '/help') {
      printHelp();
      continue;
    }

    if (trimmed === '/list') {
      const sources = store.listSources();
      if (sources.length === 0) {
        console.log('向量库为空');
      } else {
        console.log(`已索引 ${store.size()} 条记录，来源文档:`);
        sources.forEach((s) => console.log(`  📄 ${s}`));
      }
      continue;
    }

    if (trimmed === '/reset') {
      store.clear();
      if (fs.existsSync(STORE_FILE)) fs.unlinkSync(STORE_FILE);
      console.log('🗑️  向量库已清空');
      continue;
    }

    if (trimmed.startsWith('/ingest ')) {
      const filePath = trimmed.slice('/ingest '.length).trim();
      try {
        await ingest(store, filePath);
      } catch (error) {
        console.log(`❌ 导入失败: ${error instanceof Error ? error.message : String(error)}`);
      }
      continue;
    }

    if (trimmed.startsWith('/ask ')) {
      const question = trimmed.slice('/ask '.length).trim();
      console.log(`\n🔍 检索中...`);
      try {
        const { answer, sources } = await ragQuery(store, question);
        console.log(`📚 检索到 ${sources.length} 个片段:`);
        sources.forEach((s, i) => {
          console.log(`   [${i + 1}] ${s.record.metadata.source} | 相似度 ${s.score.toFixed(4)}`);
        });
        console.log(`\n💬 回答:\n${answer}`);
      } catch (error) {
        console.log(`❌ 查询失败: ${error instanceof Error ? error.message : String(error)}`);
      }
      continue;
    }

    // 默认当作问题
    console.log(`🔍 检索中...`);
    try {
      const { answer, sources } = await ragQuery(store, trimmed);
      console.log(`📚 检索到 ${sources.length} 个片段:`);
      sources.forEach((s, i) => {
        console.log(`   [${i + 1}] ${s.record.metadata.source} | 相似度 ${s.score.toFixed(4)}`);
      });
      console.log(`\n💬 回答:\n${answer}`);
    } catch (error) {
      console.log(`❌ 查询失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

main().catch(console.error);

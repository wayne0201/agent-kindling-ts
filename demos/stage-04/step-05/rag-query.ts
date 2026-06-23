/**
 * Stage 4 · Step 5: RAG 闭环
 *
 * 把 Step 1-4 的零件装成完整的 RAG：
 *   用户问题 → 向量化 → 从向量库检索 topK → 拼进 Prompt → LLM 回答
 *
 * RAG 和普通 Chat 的区别就一个：回答之前先"翻抽屉"找纸条，照着纸条答。
 * System Prompt 里 "资料没有就说不知道" 是防幻觉的关键。
 */
import OpenAI from 'openai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { API_KEY, BASE_URL, MODEL } from '../../common/config.js';
import { VectorStore } from '../_shared/vector-store.js';
import { splitText } from '../_shared/chunker.js';
import { parseDocument } from '../_shared/pdf-parser.js';

const chat = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
const STORE_FILE = path.resolve(import.meta.dirname, '../data/vector-store.json');
const KNOWLEDGE_FILE = path.resolve(import.meta.dirname, '../knowledge/llm-handbook.txt');

// ══════════════════════════════════════════════════════════════
// RAG 查询 = 检索 + 生成
// ══════════════════════════════════════════════════════════════

async function ragQuery(store: VectorStore, question: string) {
  // ① 从向量库检索最相关的 3 个片段
  const results = await store.search(question, 3);

  // ② 把片段拼成"参考资料"
  const context = results
    .map((r, i) => `[片段${i + 1}] ${r.record.text}`)
    .join('\n\n');

  // ③ 构造 Prompt —— System Prompt 约束模型只看资料
  const answer = await chat.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: [
          '你是严谨的问答助手，根据下方【参考资料】回答问题。',
          '规则：',
          '1. 只基于【参考资料】回答，不编造。',
          '2. 如果资料中没有答案，回答"根据已有资料无法回答"。',
          `\n【参考资料】\n${context}`,
        ].join('\n'),
      },
      { role: 'user', content: question },
    ],
  });

  return {
    answer: answer.choices[0].message.content ?? '',
    topScore: results[0]?.score ?? 0,
    sourceCount: results.length,
  };
}

// ══════════════════════════════════════════════════════════════
// 主流程
// ══════════════════════════════════════════════════════════════

async function main() {
  // 1. 准备向量库（优先复用 Step 4 的持久化文件）
  const store = new VectorStore();
  if (fs.existsSync(STORE_FILE)) {
    store.load(STORE_FILE);
  } else {
    const text = await parseDocument(KNOWLEDGE_FILE);
    const chunks = splitText(text, 400, 60);
    await store.addTexts(chunks.map((c) => c.text), path.basename(KNOWLEDGE_FILE));
    store.save(STORE_FILE);
  }
  console.log(`向量库就绪: ${store.size()} 条记录`);

  // 2. 域内问题（资料中有答案）
  console.log('\n── 域内问题（资料中有答案）──');
  const inDomain = [
    '什么是上下文窗口？',
    'Function Calling 的四个步骤是什么？',
    'RAG 解决什么核心问题？',
  ];
  for (const q of inDomain) {
    const { answer, topScore, sourceCount } = await ragQuery(store, q);
    console.log(`\n❓ ${q}`);
    console.log(`   检索 ${sourceCount} 条 | 最高 ${topScore.toFixed(4)}`);
    console.log(`   ${answer.slice(0, 120)}...`);
  }

  // 3. 域外问题（资料中没有 → 应拒绝回答）
  console.log('\n\n── 域外问题（资料中没有 → 应拒绝回答）──');
  const outDomain = [
    '2024 年世界杯冠军是谁？',
    '北京到上海的高铁多少钱？',
  ];
  for (const q of outDomain) {
    const { answer, topScore, sourceCount } = await ragQuery(store, q);
    console.log(`\n❓ ${q}`);
    console.log(`   检索 ${sourceCount} 条 | 最高 ${topScore.toFixed(4)}`);
    console.log(`   ${answer}`);
  }
}

main().catch(console.error);

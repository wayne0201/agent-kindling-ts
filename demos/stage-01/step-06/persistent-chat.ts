/**
 * Step 6: 持久化对话助手
 * 目标：引入 fs 模块，将 messages 数组序列化到磁盘，
 *       解决 Step 5 进程重启即失忆的问题。
 *
 * 核心机制：
 *   - 启动时从 chat_history.json 恢复历史
 *   - 每轮对话后自动落盘
 *   - /clear 清空对话并删除文件
 */

import OpenAI from 'openai';
import * as readline from 'node:readline/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { API_KEY, BASE_URL, MODEL, PROVIDER_NAME } from '../../common/config.js';

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

// ── 持久化文件路径 ──
const HISTORY_FILE = path.resolve(import.meta.dirname, 'chat_history.json');

// ── 会话状态 ──
let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
let roundCount = 0;
let totalPromptTokens = 0;
let totalCompletionTokens = 0;

// ── 启动时加载历史 ──
function loadHistory(): void {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        messages = parsed;
        // 恢复轮数：user 消息数量即为已完成的对话轮数
        roundCount = messages.filter((m) => m.role === 'user').length;
        console.log(`📂 已加载历史记录: ${messages.length} 条消息，${roundCount} 轮对话`);
        return;
      }
    }
  } catch (error) {
    console.log('⚠️ 历史文件损坏或格式错误，从零开始对话');
  }
  // 文件不存在或无有效历史，初始化 System Prompt
  messages = [
    { role: 'system', content: '你是一位严谨但充满热情的编程导师，回答简洁有力。' },
  ];
  console.log('🆕 新对话已开始');
}

// ── 每轮落盘 ──
function saveHistory(): void {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(messages, null, 2), 'utf-8');
  } catch (error) {
    console.error('⚠️ 保存历史失败:', error);
  }
}

// ── 清空对话 ──
function clearHistory(): void {
  messages = [
    { role: 'system', content: '你是一位严谨但充满热情的编程导师，回答简洁有力。' },
  ];
  roundCount = 0;
  totalPromptTokens = 0;
  totalCompletionTokens = 0;
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      fs.unlinkSync(HISTORY_FILE);
    }
  } catch {
    // 文件不存在或无法删除，不阻塞
  }
  console.log('🧹 对话历史已清空\n');
}

// ── 交互界面 ──
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// ── 优雅退出 ──
function printSummary() {
  console.log('\n📊 会话摘要');
  console.log(`  对话轮数: ${roundCount}`);
  console.log(`  累计 Prompt tokens: ${totalPromptTokens}`);
  console.log(`  累计 Completion tokens: ${totalCompletionTokens}`);
  console.log(`  历史文件: ${HISTORY_FILE}`);
  console.log(`  消息总数: ${messages.length}`);
  console.log('👋 再见！');
}

async function gracefulExit() {
  printSummary();
  rl.close();
  process.exit(0);
}

process.on('SIGINT', gracefulExit);

// ── 主循环 ──
async function main() {
  loadHistory();

  console.log('═══════════════════════════════════════════');
  console.log(`🤖 持久化对话助手 (${PROVIDER_NAME})`);
  console.log('   输入 /exit 退出 | /clear 清空 | Ctrl+C 退出');
  console.log('═══════════════════════════════════════════\n');

  while (true) {
    const input = await rl.question('You: ');

    if (!input.trim()) continue;

    // 退出指令
    if (input.trim() === '/exit') {
      await gracefulExit();
      return;
    }

    // 清空指令
    if (input.trim() === '/clear') {
      clearHistory();
      continue;
    }

    // 追加用户消息
    messages.push({ role: 'user', content: input });
    roundCount++;

    try {
      const stream = await client.chat.completions.create({
        model: MODEL,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      });

      let fullContent = '';

      process.stdout.write('AI:  ');

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const content = delta?.content ?? '';

        if (content) {
          process.stdout.write(content);
          fullContent += content;
        }

        if (chunk.usage) {
          totalPromptTokens += chunk.usage.prompt_tokens ?? 0;
          totalCompletionTokens += chunk.usage.completion_tokens ?? 0;
        }
      }

      process.stdout.write('\n');

      // 追加 assistant 回复 → 落盘
      if (fullContent) {
        messages.push({ role: 'assistant', content: fullContent });
        saveHistory();
      }

      console.log(`📊 [轮次 ${roundCount}] 上下文 ${messages.length} 条消息 | ` +
        `累计 tokens: ${totalPromptTokens}P / ${totalCompletionTokens}C\n`);
    } catch (error) {
      console.error('❌ 本轮请求失败:', error);
      messages.pop();
      roundCount--;
    }
  }
}

main().catch(console.error);

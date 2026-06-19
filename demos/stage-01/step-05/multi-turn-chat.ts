/**
 * Step 5: 上下文管理 —— 多轮对话基础
 * 目标：理解 LLM 无状态特性，通过 messages 数组手动实现"记忆"。
 *
 * 核心机制：
 *   每次对话后将 assistant 回复 push 回 messages 数组，
 *   下一轮请求时将完整历史重新发送给模型——这就是"多轮记忆"的本质。
 */

import OpenAI from 'openai';
import * as readline from 'node:readline/promises';
import { API_KEY, BASE_URL, MODEL, PROVIDER_NAME } from '../../common/config.js';

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

// ── 会话状态 ──
const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
  { role: 'system', content: '你是一位严谨但充满热情的编程导师，回答简洁有力。' },
];

let roundCount = 0;
let totalPromptTokens = 0;
let totalCompletionTokens = 0;

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
  console.log(`  最终上下文长度: ${messages.length} 条消息`);
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
  console.log('═══════════════════════════════════════════');
  console.log(`🤖 多轮对话助手 (${PROVIDER_NAME})`);
  console.log('   输入 /exit 退出 | Ctrl+C 退出');
  console.log('═══════════════════════════════════════════\n');

  while (true) {
    const input = await rl.question('You: ');

    // 空输入跳过
    if (!input.trim()) continue;

    // 退出指令
    if (input.trim() === '/exit') {
      await gracefulExit();
      return;
    }

    // 追加用户消息
    messages.push({ role: 'user', content: input });
    roundCount++;

    try {
      // 流式请求
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

        // 最后一个 chunk 可能携带 usage（取决于模型厂商是否支持 stream_options）
        if (chunk.usage) {
          totalPromptTokens += chunk.usage.prompt_tokens ?? 0;
          totalCompletionTokens += chunk.usage.completion_tokens ?? 0;
        }
      }

      process.stdout.write('\n');

      // 追加 assistant 回复到历史 —— 这是"记忆"的关键
      if (fullContent) {
        messages.push({ role: 'assistant', content: fullContent });
      }

      // 打印本轮统计
      console.log(`📊 [轮次 ${roundCount}] 上下文 ${messages.length} 条消息 | ` +
        `累计 tokens: ${totalPromptTokens}P / ${totalCompletionTokens}C\n`);
    } catch (error) {
      console.error('❌ 本轮请求失败:', error);
      // 失败时移除未得到回复的 user 消息，保持消息数组干净
      messages.pop();
      roundCount--;
    }
  }
}

main().catch(console.error);

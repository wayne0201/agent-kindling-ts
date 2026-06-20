/**
 * Stage 2 · Step 5: 交互式工具调用 Agent
 * 目标：将 Stage 1 的多轮对话循环与 Function Calling 结合。
 *       每轮模型可能选择回复文本或调用工具，客户端需分支处理。
 *
 * 核心机制：
 *   while (true) {
 *     1. 用户输入 → push user message
 *     2. 模型响应 → 可能是文本回复，也可能是 tool_calls
 *     3. 如果是 tool_calls → 执行工具 → 回传结果 → 再次请求模型
 *     4. 如果是文本 → 流式输出 → push assistant message
 *   }
 */
import OpenAI from 'openai';
import * as readline from 'node:readline/promises';
import { API_KEY, BASE_URL, MODEL, PROVIDER_NAME } from '../../common/config.js';

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

// ── 工具定义 ──

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '获取指定城市的当前天气信息',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名称，如"北京"、"上海"' },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_time',
      description: '获取当前时间',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: '执行数学计算，支持加减乘除',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: '数学表达式，如"2 + 3 * 4"' },
        },
        required: ['expression'],
      },
    },
  },
];

// ── 工具实现 ──

const weatherData: Record<string, { temp: string; condition: string }> = {
  北京: { temp: '28°C', condition: '晴' },
  上海: { temp: '32°C', condition: '多云' },
  深圳: { temp: '35°C', condition: '雷阵雨' },
  成都: { temp: '25°C', condition: '阴' },
};

function getWeather(args: { city: string }): string {
  const weather = weatherData[args.city];
  if (weather) return JSON.stringify({ city: args.city, ...weather });
  return JSON.stringify({ error: `未找到城市"${args.city}"的天气数据，支持：北京、上海、深圳、成都` });
}

function getTime(): string {
  return JSON.stringify({ time: new Date().toLocaleString('zh-CN', { hour12: false }) });
}

function calculate(args: { expression: string }): string {
  try {
    const expr = args.expression.replace(/[^0-9+\-*/().\s]/g, '');
    if (!expr) return JSON.stringify({ error: '无效的表达式' });
    if (/\/\s*0(?!\.\d)/.test(expr)) return JSON.stringify({ error: '除零错误' });
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)();
    return JSON.stringify({ expression: args.expression, result });
  } catch {
    return JSON.stringify({ error: `无法计算: ${args.expression}` });
  }
}

const toolMap: Record<string, (args: Record<string, unknown>) => string> = {
  get_weather: (args) => getWeather(args as { city: string }),
  get_time: () => getTime(),
  calculate: (args) => calculate(args as { expression: string }),
};

// ── 会话状态 ──

const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
  { role: 'system', content: '你是一个智能助手，可以查天气、查时间、做数学计算。根据用户问题自主判断是否需要调用工具。回答简洁友好。' },
];

let roundCount = 0;
let toolCallCount = 0;

// ── 交互界面 ──

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function printSummary() {
  console.log('\n📊 会话摘要');
  console.log(`  对话轮数: ${roundCount}`);
  console.log(`  工具调用次数: ${toolCallCount}`);
  console.log(`  上下文消息数: ${messages.length}`);
  console.log('👋 再见！');
}

async function gracefulExit() {
  printSummary();
  rl.close();
  process.exit(0);
}

process.on('SIGINT', gracefulExit);

// ── 处理一轮对话（含工具调用循环） ──

async function processTurn(userInput: string): Promise<void> {
  messages.push({ role: 'user', content: userInput });
  roundCount++;

  // 工具调用循环：模型可能连续调用工具，直到返回纯文本
  let maxIterations = 5; // 防止无限循环

  while (maxIterations-- > 0) {
    // 非流式请求，检查是否有 tool_calls
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,
    });

    const choice = response.choices[0];
    const toolCalls = choice.message.tool_calls;

    // 情况 1：模型直接回复文本（无工具调用）
    if (!toolCalls || toolCalls.length === 0) {
      const content = choice.message.content ?? '';
      process.stdout.write('AI:  ');
      process.stdout.write(content);
      process.stdout.write('\n');

      messages.push({ role: 'assistant', content });
      break;
    }

    // 情况 2：模型决定调用工具
    messages.push(choice.message);

    for (const tc of toolCalls) {
      if (tc.type !== 'function') continue;
      const fn = toolMap[tc.function.name];

      let result: string;
      try {
        const args = JSON.parse(tc.function.arguments);
        console.log(`   🔧 调用工具: ${tc.function.name}(${JSON.stringify(args)})`);
        result = fn ? fn(args) : JSON.stringify({ error: `未知工具: ${tc.function.name}` });
        toolCallCount++;
      } catch (error) {
        result = JSON.stringify({ error: `工具执行失败: ${error instanceof Error ? error.message : String(error)}` });
      }

      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: tc.id,
      } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);
    }

    // 继续循环：将工具结果回传模型，模型可能再次调用工具或返回文本
  }

  if (maxIterations < 0) {
    console.log('   ⚠️ 工具调用次数过多，已中断');
  }
}

// ── 主循环 ──

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(`🤖 交互式工具调用 Agent (${PROVIDER_NAME})`);
  console.log('   可用工具: 查天气 / 查时间 / 数学计算');
  console.log('   输入 /exit 退出 | Ctrl+C 退出');
  console.log('═══════════════════════════════════════════\n');

  while (true) {
    const input = await rl.question('You: ');

    if (!input.trim()) continue;
    if (input.trim() === '/exit') {
      await gracefulExit();
      return;
    }

    try {
      await processTurn(input);
      console.log(`📊 [轮次 ${roundCount}] 工具调用 ${toolCallCount} 次 | 上下文 ${messages.length} 条消息\n`);
    } catch (error) {
      console.error('❌ 本轮请求失败:', error);
      messages.pop(); // 移除未得到回复的 user 消息
      roundCount--;
    }
  }
}

main().catch(console.error);

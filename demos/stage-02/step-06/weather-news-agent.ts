/**
 * Stage 2 · Step 6: 交付物 —— 天气+新闻 Agent
 * 目标：整合前五步能力，交付一个实用的工具调用 Agent。
 *
 * 工具：
 *   - get_weather: 查询城市天气（模拟真实 API 响应结构）
 *   - search_news: 搜索新闻（模拟真实 API 响应结构）
 *
 * 特性：
 *   - System Prompt 约束 Agent 行为边界
 *   - 多轮对话 + 工具调用循环
 *   - 流式输出：用 Step 4 学过的 accumulator 模式，一次流式请求同时处理
 *     tool_calls 拼接和文本打字机效果，无需额外 API 调用
 *   - 工具执行异常处理
 */
import OpenAI from 'openai';
import * as readline from 'node:readline/promises';
import { API_KEY, BASE_URL, MODEL, PROVIDER_NAME } from '../../common/config.js';

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

// ═══════════════════════════════════════════════
// 工具定义
// ═══════════════════════════════════════════════

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询指定城市的当前天气，包括温度、天气状况、湿度、风力',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名称，如"北京"、"上海"、"深圳"' },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_news',
      description: '搜索最新新闻，可按关键词和分类筛选',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: '搜索关键词，如"AI"、"新能源"' },
          category: { type: 'string', description: '新闻分类：科技、财经、社会、体育', enum: ['科技', '财经', '社会', '体育'] },
        },
      },
    },
  },
];

// ═══════════════════════════════════════════════
// 工具实现（模拟真实 API）
// ═══════════════════════════════════════════════

const weatherDB: Record<string, { temp: number; condition: string; humidity: string; wind: string }> = {
  北京: { temp: 28, condition: '晴', humidity: '45%', wind: '北风3级' },
  上海: { temp: 32, condition: '多云', humidity: '68%', wind: '东南风2级' },
  深圳: { temp: 35, condition: '雷阵雨', humidity: '85%', wind: '南风4级' },
  成都: { temp: 25, condition: '阴', humidity: '72%', wind: '微风' },
  广州: { temp: 34, condition: '晴', humidity: '75%', wind: '南风2级' },
  杭州: { temp: 30, condition: '多云', humidity: '65%', wind: '东风3级' },
};

function getWeather(args: { city?: string }): string {
  if (!args.city) return JSON.stringify({ error: '缺少参数 city' });
  const weather = weatherDB[args.city];
  if (!weather) {
    return JSON.stringify({ error: `暂不支持城市"${args.city}"，当前支持：${Object.keys(weatherDB).join('、')}` });
  }
  return JSON.stringify({ city: args.city, ...weather, updatedAt: new Date().toISOString() });
}

const newsDB: { title: string; category: string; summary: string; source: string; publishedAt: string }[] = [
  { title: 'GPT-5 发布：多模态能力大幅提升', category: '科技', summary: '新一代模型在推理、编程、视觉理解方面显著进步。', source: '科技日报', publishedAt: '2026-06-19' },
  { title: '新能源汽车销量再创新高', category: '财经', summary: '本月新能源车销量同比增长 45%，市场渗透率突破 40%。', source: '财经网', publishedAt: '2026-06-18' },
  { title: '国产大模型开源生态蓬勃发展', category: '科技', summary: '多家厂商宣布开源最新模型权重，推动行业协作。', source: '开源中国', publishedAt: '2026-06-19' },
  { title: '欧冠决赛精彩落幕', category: '体育', summary: '本赛季欧冠冠军诞生，比赛过程跌宕起伏。', source: '体育周刊', publishedAt: '2026-06-17' },
  { title: '城市绿化新规正式实施', category: '社会', summary: '新规要求新建小区绿化率不低于 35%。', source: '社会新闻', publishedAt: '2026-06-18' },
  { title: 'AI 编程工具用户数突破千万', category: '科技', summary: '开发者社区调查显示，AI 辅助编程工具采用率已达 60%。', source: 'InfoQ', publishedAt: '2026-06-19' },
];

function searchNews(args: { keyword?: string; category?: string }): string {
  let results = newsDB;

  if (args.category) {
    results = results.filter((n) => n.category === args.category);
  }

  if (args.keyword) {
    const kw = args.keyword.toLowerCase();
    results = results.filter(
      (n) => n.title.toLowerCase().includes(kw) || n.summary.toLowerCase().includes(kw),
    );
  }

  if (results.length === 0) {
    return JSON.stringify({ message: '未找到相关新闻', results: [] });
  }

  return JSON.stringify({ total: results.length, results: results.slice(0, 5) });
}

const toolMap: Record<string, (args: Record<string, unknown>) => string> = {
  get_weather: (args) => getWeather(args as { city?: string }),
  search_news: (args) => searchNews(args as { keyword?: string; category?: string }),
};

// ═══════════════════════════════════════════════
// 流式 tool_calls 拼接器（复用 Step 4 模式）
// ═══════════════════════════════════════════════

interface StreamingToolCall {
  id: string;
  name: string;
  arguments: string;
}

function createToolCallAccumulator() {
  const calls: Map<number, StreamingToolCall> = new Map();

  return {
    accumulate(
      delta:
        | { index: number; id?: string; function?: { name?: string; arguments?: string } }
        | undefined,
    ) {
      if (!delta) return;
      const idx = delta.index;
      const existing = calls.get(idx);

      if (!existing) {
        calls.set(idx, {
          id: delta.id ?? '',
          name: delta.function?.name ?? '',
          arguments: delta.function?.arguments ?? '',
        });
      } else {
        if (delta.function?.arguments) existing.arguments += delta.function.arguments;
        if (!existing.id && delta.id) existing.id = delta.id;
        if (!existing.name && delta.function?.name) existing.name = delta.function.name;
      }
    },

    getResults(): StreamingToolCall[] {
      return Array.from(calls.values());
    },
  };
}

// ═══════════════════════════════════════════════
// 会话状态
// ═══════════════════════════════════════════════

const SYSTEM_PROMPT = `你是一个智能生活助手，可以帮助用户查询天气和搜索新闻。

行为准则：
1. 当用户询问天气时，调用 get_weather 工具查询。
2. 当用户询问新闻时，调用 search_news 工具搜索。
3. 纯闲聊时不调用任何工具，直接友好回复。
4. 工具返回结果后，用自然语言总结，不要直接输出 JSON。
5. 如果工具返回错误，向用户解释原因并提供替代建议。
6. 回答简洁友好，避免冗长。`;

const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
  { role: 'system', content: SYSTEM_PROMPT },
];

let roundCount = 0;
let toolCallCount = 0;

// ═══════════════════════════════════════════════
// 交互界面
// ═══════════════════════════════════════════════

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

// ═══════════════════════════════════════════════
// Agent 核心循环
// ═══════════════════════════════════════════════

async function processTurn(userInput: string): Promise<void> {
  messages.push({ role: 'user', content: userInput });
  roundCount++;

  let maxIterations = 5;

  while (maxIterations-- > 0) {
    // 流式请求：一次请求同时处理 tool_calls 拼接和文本打字机效果
    const stream = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      stream: true,
    });

    const accumulator = createToolCallAccumulator();
    let textContent = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      // 文本 delta：直接输出（打字机效果）
      if (delta?.content) {
        if (!textContent) process.stdout.write('AI:  ');
        process.stdout.write(delta.content);
        textContent += delta.content;
      }

      // tool_calls delta：拼接
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          if ('index' in tc) {
            accumulator.accumulate(
              tc as { index: number; id?: string; function?: { name?: string; arguments?: string } },
            );
          }
        }
      }
    }

    const toolCalls = accumulator.getResults();

    // 无工具调用：文本已输出，结束本轮
    if (toolCalls.length === 0) {
      if (textContent) {
        process.stdout.write('\n');
        messages.push({ role: 'assistant', content: textContent });
      }
      break;
    }

    // 有工具调用：执行并回传
    process.stdout.write('\n');
    messages.push({
      role: 'assistant',
      content: textContent || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    for (const tc of toolCalls) {
      if (tc.name) {
        const fn = toolMap[tc.name];
        let result: string;
        try {
          const args = JSON.parse(tc.arguments);
          console.log(`   🔧 ${tc.name}(${JSON.stringify(args)})`);
          result = fn ? fn(args) : JSON.stringify({ error: `未知工具: ${tc.name}` });
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
    }

    // 继续循环：将工具结果回传模型，模型可能再次调用工具或返回文本
  }

  if (maxIterations < 0) {
    console.log('   ⚠️ 工具调用次数过多，已中断');
  }
}

// ═══════════════════════════════════════════════
// 主循环
// ═══════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(`🤖 天气+新闻 Agent (${PROVIDER_NAME})`);
  console.log('   能力: 查天气 🔆 | 搜新闻 📰 | 闲聊 💬');
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
      messages.pop();
      roundCount--;
    }
  }
}

main().catch(console.error);

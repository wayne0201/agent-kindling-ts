/**
 * Stage 2 · Step 4: 流式 Function Calling
 * 目标：流式模式下正确处理 tool_calls 的增量拼接。
 *
 * 核心难点：
 *   流式模式下 tool_calls 的 function.arguments 是分块返回的 JSON 字符串碎片，
 *   需要按 index 聚合并拼接完整后才能 JSON.parse()。
 *
 * 演示策略：
 *   真实流式请求中 chunks 到达极快，终端里瞬间刷完看不清拼接过程。
 *   本 demo 在每个 tool_calls chunk 之间加入延时，让你直观观察碎片如何逐步拼成完整 JSON。
 *   文本 chunk 不加延时，保持正常流式体验——这也是真实应用中的处理方式。
 *
 * 文本流式 vs 工具调用流式：
 *   - 文本流式：每个 delta.content 可直接展示给用户（逐字渲染）
 *   - 工具调用流式：每个 delta.arguments 是 JSON 碎片，不能直接使用，
 *     必须等拼接完整后才能 JSON.parse() 并执行工具
 *
 * 流结束 = tool_calls 一定完整：
 *   API 保证一次流式响应中的所有 tool_calls 不会跨流拆分。
 *   for await 循环退出时，arguments 一定已拼接完整，可以安全 JSON.parse()。
 *
 * 两次 API 调用模式：
 *   第一次流 → 拿到 tool_calls → 流结束 → 本地执行工具 → 结果塞回 messages
 *   第二次流 → 全新请求，文字从头逐字输出（不存在"攒一大段"的问题）
 *
 * 不同模型的 chunk 粒度不同：
 *   - OpenAI GPT-4 等：arguments 分多个 chunk 返回，能看到碎片拼接过程
 *   - 智谱 GLM 4.5-air 等：tool_calls 可能一次性返回完整 JSON
 *   accumulator 的增量拼接逻辑对两种情况都能正确处理。
 */
import OpenAI from 'openai';
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
];

// ── 工具实现 ──

const weatherData: Record<string, { temp: string; condition: string }> = {
  北京: { temp: '28°C', condition: '晴' },
  上海: { temp: '32°C', condition: '多云' },
};

function getWeather(args: { city: string }): string {
  const weather = weatherData[args.city];
  if (weather) return JSON.stringify({ city: args.city, ...weather });
  return JSON.stringify({ error: `未找到城市"${args.city}"的天气数据` });
}

const toolMap: Record<string, (args: Record<string, unknown>) => string> = {
  get_weather: (args) => getWeather(args as { city: string }),
};

// ── 流式 tool_calls 拼接器 ──

interface StreamingToolCall {
  id: string;
  name: string;
  arguments: string; // 增量拼接的 JSON 字符串
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

    getSnapshot(index: number): StreamingToolCall | undefined {
      return calls.get(index);
    },

    indexes(): number[] {
      return Array.from(calls.keys()).sort((a, b) => a - b);
    },

    getResults(): StreamingToolCall[] {
      return Array.from(calls.values());
    },
  };
}

// ── 辅助函数 ──

/** tool_calls chunk 之间的延时，方便观察拼接过程 */
const CHUNK_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatMs(ms: number): string {
  return `${String(ms).padStart(4)}ms`;
}

/** 装饰 arguments 字符串：已闭合显示 ✅，未闭合显示 ┆ 光标。 */
function prettifyArgs(raw: string): string {
  if (!raw) return '(空)';
  try {
    JSON.parse(raw);
    return JSON.stringify(JSON.parse(raw)) + '  ✅';
  } catch {
    return raw + ' ┆';
  }
}

// ── 主流程 ──

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🌊 流式 Function Calling (${PROVIDER_NAME})`);
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('用户: 北京和上海今天天气怎么样？\n');

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: '你是一个天气助手，可以查询城市天气。' },
    { role: 'user', content: '北京和上海今天天气怎么样？' },
  ];

  // ═══════════════════════════════════════════════════════
  //  ① 流式请求：tool_calls chunk 间加延时，观察碎片拼接
  // ═══════════════════════════════════════════════════════

  const stream = await client.chat.completions.create({
    model: MODEL,
    messages,
    tools,
    stream: true,
  });

  const accumulator = createToolCallAccumulator();
  const startTime = Date.now();
  let chunkCount = 0;

  for await (const chunk of stream) {
    chunkCount++;
    const elapsed = Date.now() - startTime;
    const delta = chunk.choices[0]?.delta;

    // 文本 delta：直接输出，不加延时
    if (delta?.content) {
      process.stdout.write(delta.content);
    }

    // tool_calls delta：展示碎片 → 拼接 → 延时
    if (delta?.tool_calls) {
      for (const tc of delta.tool_calls) {
        if ('index' in tc) {
          const tcDelta = tc as {
            index: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          };

          // 📥 本帧收到的碎片
          const parts: string[] = [];
          if (tcDelta.id) parts.push(`id: ${tcDelta.id}`);
          if (tcDelta.function?.name) parts.push(`name: "${tcDelta.function.name}"`);
          if (tcDelta.function?.arguments) parts.push(`args += "${tcDelta.function.arguments}"`);
          console.log(`  📥 [${formatMs(elapsed)}] [${tcDelta.index}] ${parts.join(', ')}`);

          accumulator.accumulate(tcDelta);
        }
      }

      // 🧩 当前拼接状态
      for (const idx of accumulator.indexes()) {
        const snap = accumulator.getSnapshot(idx)!;
        console.log(`  🧩 [${idx}] ${snap.name || '(?)'}(${prettifyArgs(snap.arguments)})`);
      }

      await sleep(CHUNK_DELAY_MS);
    }
  }

  const totalTime = Date.now() - startTime;
  console.log(`\n  ── 流结束，${chunkCount} chunks，${totalTime}ms ──\n`);

  const toolCalls = accumulator.getResults();
  if (toolCalls.length === 0) {
    console.log('⚠️ 模型未调用工具');
    return;
  }

  // ═══════════════════════════════════════════════════════
  //  ② 执行工具
  // ═══════════════════════════════════════════════════════

  messages.push({
    role: 'assistant',
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: { name: tc.name, arguments: tc.arguments },
    })),
  });

  for (const tc of toolCalls) {
    const fn = toolMap[tc.name];
    const args = JSON.parse(tc.arguments);
    const result = fn ? fn(args) : JSON.stringify({ error: `未知工具: ${tc.name}` });
    console.log(`  🔧 ${tc.name}(${JSON.stringify(args)}) → ${result}`);

    messages.push({
      role: 'tool',
      content: result,
      tool_call_id: tc.id,
    } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);
  }

  // ═══════════════════════════════════════════════════════
  //  ③ 最终回复（第二次流式请求，全新流，逐字输出）
  // ═══════════════════════════════════════════════════════

  console.log('\n  💬 ');

  const finalStream = await client.chat.completions.create({
    model: MODEL,
    messages,
    stream: true,
  });

  for await (const chunk of finalStream) {
    const content = chunk.choices[0]?.delta?.content ?? '';
    if (content) process.stdout.write(content);
  }

  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('✅ 完成');
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(console.error);

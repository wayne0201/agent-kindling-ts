/**
 * Stage 2 · Step 1: Function Calling 初体验
 * 目标：理解 Function Calling 的四步流程
 *   ① 客户端注册工具（tools 参数）
 *   ② 模型决定调用并返回 tool_calls
 *   ③ 客户端执行工具函数
 *   ④ 将结果以 role: "tool" 回传模型，获得最终回复
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
          city: {
            type: 'string',
            description: '城市名称，如"北京"、"上海"',
          },
        },
        required: ['city'],
      },
    },
  },
];

// ── 工具实现（模拟） ──

const weatherData: Record<string, { temp: string; condition: string }> = {
  北京: { temp: '28°C', condition: '晴' },
  上海: { temp: '32°C', condition: '多云' },
  深圳: { temp: '35°C', condition: '雷阵雨' },
  成都: { temp: '25°C', condition: '阴' },
};

function getWeather(args: { city: string }): string {
  const weather = weatherData[args.city];
  if (weather) {
    return JSON.stringify({ city: args.city, ...weather });
  }
  return JSON.stringify({ error: `未找到城市"${args.city}"的天气数据` });
}

// 工具名 → 执行函数的映射
const toolMap: Record<string, (args: Record<string, unknown>) => string> = {
  get_weather: (args) => getWeather(args as { city: string }),
};

// ── 主流程 ──

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(`🔧 Function Calling 初体验 (${PROVIDER_NAME})`);
  console.log('═══════════════════════════════════════════\n');

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: '你是一个天气助手，可以查询城市天气。' },
    { role: 'user', content: '北京今天天气怎么样？' },
  ];

  // ── 第①步：发送请求，注册工具 ──
  console.log('① 发送请求（携带 tools 参数）...');
  console.log(`   用户: ${messages[messages.length - 1].content}\n`);

  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    tools,
  });

  

  const choice = response.choices[0];

  const finishReason = choice.finish_reason;
  console.log(`   finish_reason: ${finishReason}`);

  // ── 第②步：检查模型是否决定调用工具 ──
  const toolCalls = choice.message.tool_calls;

  if (!toolCalls || toolCalls.length === 0) {
    console.log('\n⚠️ 模型未调用工具，直接回复:');
    console.log(`   ${choice.message.content}`);
    return;
  }

  console.log(`\n② 模型决定调用工具:`);
  for (const tc of toolCalls) {
    if (tc.type !== 'function') continue;
    console.log(`   工具: ${tc.function.name}`);
    console.log(`   参数: ${tc.function.arguments}`);
  }

  // 将模型的 assistant 消息（含 tool_calls）追加到 messages
  messages.push(choice.message);

  // ── 第③步：执行工具函数 ──
  console.log('\n③ 执行工具函数:');

  for (const tc of toolCalls) {
    if (tc.type !== 'function') continue;
    const fn = toolMap[tc.function.name];
    if (!fn) {
      console.log(`   ❌ 未知工具: ${tc.function.name}`);
      continue;
    }

    const args = JSON.parse(tc.function.arguments);
    console.log(`   执行 ${tc.function.name}(${JSON.stringify(args)})...`);
    const result = fn(args);
    console.log(`   结果: ${result}`);

    // ── 第④步：将结果以 role: "tool" 回传 ──
    messages.push({
      role: 'tool',
      content: result,
      tool_call_id: tc.id,
    } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);
  }

  // 再次请求，让模型基于工具结果生成自然语言回复
  console.log('\n④ 将工具结果回传模型，获取最终回复...');
  const finalResponse = await client.chat.completions.create({
    model: MODEL,
    messages,
  });

  console.log('\n═══════════════════════════════════════════');
  console.log('✅ 最终回复:');
  console.log(`   ${finalResponse.choices[0].message.content}`);
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);

/**
 * Stage 2 · Step 3: 工具参数校验与异常处理
 * 目标：模型生成的参数不一定合法，客户端必须校验。
 *       异常时将错误信息以 role: "tool" 回传，让模型自行修正。
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
      name: 'calculate',
      description: '执行数学计算，支持加减乘除',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: '数学表达式，如"2 + 3 * 4"、"100 / 5"' },
        },
        required: ['expression'],
      },
    },
  },
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

// ── 工具实现（带校验） ──

type ToolResult = { ok: boolean; data?: string; error?: string };

function calculate(args: { expression?: string }): ToolResult {
  // 校验 1：必填字段
  if (!args.expression) {
    return { ok: false, error: '缺少必填参数 expression' };
  }

  // 校验 2：类型检查
  if (typeof args.expression !== 'string') {
    return { ok: false, error: `参数 expression 应为字符串，实际为 ${typeof args.expression}` };
  }

  // 校验 3：安全过滤（仅允许数字和运算符）
  const expr = args.expression.replace(/[^0-9+\-*/().\s]/g, '');
  if (!expr.trim()) {
    return { ok: false, error: `表达式"${args.expression}"包含非法字符或为空` };
  }

  // 校验 4：除零检测
  if (/\/\s*0(?!\.\d)/.test(expr)) {
    return { ok: false, error: `除零错误：表达式 "${args.expression}" 中存在除以零的操作` };
  }

  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)();
    if (typeof result !== 'number' || !isFinite(result)) {
      return { ok: false, error: `计算结果无效: ${result}` };
    }
    return { ok: true, data: JSON.stringify({ expression: args.expression, result }) };
  } catch (error) {
    return { ok: false, error: `无法计算 "${args.expression}": ${error instanceof Error ? error.message : String(error)}` };
  }
}

const weatherData: Record<string, { temp: string; condition: string }> = {
  北京: { temp: '28°C', condition: '晴' },
  上海: { temp: '32°C', condition: '多云' },
};

function getWeather(args: { city?: string }): ToolResult {
  if (!args.city) {
    return { ok: false, error: '缺少必填参数 city' };
  }
  const weather = weatherData[args.city];
  if (!weather) {
    return { ok: false, error: `未找到城市"${args.city}"的天气数据，支持的城市：北京、上海` };
  }
  return { ok: true, data: JSON.stringify({ city: args.city, ...weather }) };
}

const toolMap: Record<string, (args: Record<string, unknown>) => ToolResult> = {
  calculate: (args) => calculate(args as { expression?: string }),
  get_weather: (args) => getWeather(args as { city?: string }),
};

// ── 带异常处理的工具调用循环 ──

async function chatWithToolErrorHandling(
  userMessage: string,
  maxRetries = 3,
): Promise<string> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: '你是一个智能助手，可以查天气、做数学计算。如果工具返回错误，请根据错误信息修正参数后重试。' },
    { role: 'user', content: userMessage },
  ];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools,
    });

    const choice = response.choices[0];
    const toolCalls = choice.message.tool_calls;

    // 无工具调用，返回文本
    if (!toolCalls || toolCalls.length === 0) {
      return choice.message.content ?? '(无回复)';
    }

    messages.push(choice.message);

    let hasError = false;

    for (const tc of toolCalls) {
      if (tc.type !== 'function') continue;
      const fn = toolMap[tc.function.name];

      let result: ToolResult;
      let args: Record<string, unknown>;

      // JSON.parse 也可能失败
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        result = { ok: false, error: `参数不是合法的 JSON: ${tc.function.arguments}` };
        args = {};
      }

      // 执行工具
      if (fn) {
        try {
          result = fn(args);
        } catch (error) {
          result = { ok: false, error: `工具执行异常: ${error instanceof Error ? error.message : String(error)}` };
        }
      } else {
        result = { ok: false, error: `未知工具: ${tc.function.name}` };
      }

      // 构造回传内容
      const content = result.ok ? result.data! : JSON.stringify({ error: result.error });
      if (!result.ok) hasError = true;
      
      messages.push({
        role: 'tool',
        content,
        tool_call_id: tc.id,
      } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);

      // 日志
      const status = result.ok ? '✅' : '❌';
      console.log(`   ${status} ${tc.function.name}(${JSON.stringify(args)}) → ${content}`);
    }

    // 如果有错误，循环会继续，让模型基于错误信息重试
    if (hasError && attempt < maxRetries) {
      console.log(`   🔄 工具执行出错，让模型重试 (attempt ${attempt + 1}/${maxRetries})...`);
    }
  }

  // 超过重试次数，最后一次请求获取回复
  const finalResponse = await client.chat.completions.create({
    model: MODEL,
    messages,
  });

  return finalResponse.choices[0].message.content ?? '(无回复)';
}

// ── 测试用例 ──

const testCases = [
  { query: '帮我算一下 10 除以 0 等于多少', desc: '除零错误（模型应重试或道歉）' },
  { query: '查一下"火星"的天气', desc: '不存在的城市（模型应换城市或说明）' },
  { query: '帮我算 100 加 200', desc: '正常计算（应成功）' },
];

// ── 主流程 ──

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(`🛡️ 工具参数校验与异常处理 (${PROVIDER_NAME})`);
  console.log('═══════════════════════════════════════════\n');

  for (const tc of testCases) {
    console.log(`▶ ${tc.desc}`);
    console.log(`  用户: ${tc.query}`);
    console.log(`  工具执行过程:`);
    const reply = await chatWithToolErrorHandling(tc.query);
    console.log(`  最终回复: ${reply.slice(0, 150)}${reply.length > 150 ? '...' : ''}`);
    console.log();
  }

  console.log('═══════════════════════════════════════════');
  console.log('✅ 异常处理实验完成');
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);

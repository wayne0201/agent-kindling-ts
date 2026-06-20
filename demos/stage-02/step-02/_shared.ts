/**
 * Step 2 共享基础设施
 * 两个 case（工具选择准确性 / tool_choice 参数对比）共用本模块：
 *   - LLM 客户端
 *   - 工具定义（get_weather / get_time / calculate）
 *   - 工具实现与 toolMap
 *   - chatWithTools 单轮对话执行器
 *
 * 本文件不单独运行，由各 case 文件导入使用。
 */
import OpenAI from 'openai';
import { API_KEY, BASE_URL, MODEL, PROVIDER_NAME } from '../../common/config.js';

export { MODEL, PROVIDER_NAME };

export const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

// ── 工具定义 ──

export const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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
      description: '获取当前时间或指定时区的时间',
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: '时区，如"Asia/Shanghai"、"UTC"，默认本地时区' },
        },
      },
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
          expression: { type: 'string', description: '数学表达式，如"2 + 3 * 4"、"100 / 5"' },
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
  return JSON.stringify({ error: `未找到城市"${args.city}"的天气数据` });
}

function getTime(args: { timezone?: string }): string {
  const now = new Date();
  const timeStr = now.toLocaleString('zh-CN', {
    timeZone: args.timezone || 'Asia/Shanghai',
    hour12: false,
  });
  return JSON.stringify({ time: timeStr, timezone: args.timezone || 'Asia/Shanghai' });
}

function calculate(args: { expression: string }): string {
  try {
    // 仅允许数字和运算符，防止代码注入
    const expr = args.expression.replace(/[^0-9+\-*/().\s]/g, '');
    if (!expr) return JSON.stringify({ error: '无效的表达式' });
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)();
    return JSON.stringify({ expression: args.expression, result });
  } catch {
    return JSON.stringify({ error: `无法计算: ${args.expression}` });
  }
}

const toolMap: Record<string, (args: Record<string, unknown>) => string> = {
  get_weather: (args) => getWeather(args as { city: string }),
  get_time: (args) => getTime(args as { timezone?: string }),
  calculate: (args) => calculate(args as { expression: string }),
};

// ── 执行单次对话（含工具调用） ──

/** 单次对话的完整行为记录，供 demo 展示模型实际做了什么。 */
export interface ChatTrace {
  /** 用户输入 */
  userMessage: string;
  /** 第一轮模型是否决定调用工具 */
  calledTools: boolean;
  /** 模型选择调用的工具名 + 参数（未调用时为空数组） */
  toolInvocations: { name: string; args: string }[];
  /** 工具执行返回的真实结果（未调用时为空数组） */
  toolResults: string[];
  /** 最终回复给用户的自然语言文本 */
  reply: string;
}

/**
 * 向模型发起带工具的对话。
 * 第一轮：模型决定是否调用工具；若调用则执行并回传，再请求第二轮生成自然语言回复。
 * 返回结构化的 ChatTrace，让调用方能展示"模型实际做了什么"，而不只是最终文本。
 */
export async function chatWithTools(
  userMessage: string,
  toolChoice: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption = 'auto',
): Promise<ChatTrace> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: '你是一个智能助手，可以查天气、查时间、做数学计算。根据用户问题选择合适的工具。',
    },
    { role: 'user', content: userMessage },
  ];

  // 第一轮：模型决定是否调用工具
  const response = await client.chat.completions.create({
    model: MODEL,
    messages,
    tools,
    tool_choice: toolChoice,
  });

  const choice = response.choices[0];
  const toolCalls = choice.message.tool_calls;

  // 无工具调用，直接返回文本
  if (!toolCalls || toolCalls.length === 0) {
    return {
      userMessage,
      calledTools: false,
      toolInvocations: [],
      toolResults: [],
      reply: choice.message.content ?? '(无回复)',
    };
  }

  // 执行工具并回传
  messages.push(choice.message);

  const trace: ChatTrace = {
    userMessage,
    calledTools: true,
    toolInvocations: [],
    toolResults: [],
    reply: '',
  };

  for (const tc of toolCalls) {
    if (tc.type !== 'function') continue;
    trace.toolInvocations.push({ name: tc.function.name, args: tc.function.arguments });

    const fn = toolMap[tc.function.name];
    const args = JSON.parse(tc.function.arguments);
    const result = fn ? fn(args) : JSON.stringify({ error: `未知工具: ${tc.function.name}` });
    trace.toolResults.push(result);

    messages.push({
      role: 'tool',
      content: result,
      tool_call_id: tc.id,
    } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);
  }

  // 第二轮：模型基于工具结果生成回复
  const finalResponse = await client.chat.completions.create({
    model: MODEL,
    messages,
  });
  trace.reply = finalResponse.choices[0].message.content ?? '(无回复)';
  return trace;
}

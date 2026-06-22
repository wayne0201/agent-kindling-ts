/**
 * Stage 3 · Step 2: ReAct 推理模式
 * 目标：在 Harness Loop 骨架上引入 ReAct（Reasoning + Acting），
 *       让 Agent 在"行动"前先"思考"，能处理需要条件判断的复杂任务。
 *
 * ReAct 三段式：
 *   Thought（思考）→ Action（工具调用）→ Observation（工具返回）
 *   多轮循环，直到 Thought 得出"任务完成，可以回复用户"。
 *
 * 本步对比实验：
 *   同一个条件任务，分别跑"无 ReAct 约束"和"有 ReAct 约束"，
 *   观察 ReAct 如何让 Agent 基于第一次观察动态决定下一步，
 *   而非盲目一次性调用所有工具。
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

const toolMap: Record<string, (args: Record<string, unknown>) => string> = {
  get_weather: (args) => getWeather(args as { city: string }),
};

// ── ReAct System Prompt ──

const REACT_SYSTEM_PROMPT = `你是一个智能助手，可以查询城市天气。

【工作方式：ReAct 模式】
面对用户问题，你必须按以下步骤推进，每一步都要先思考再行动：

1. Thought：先输出你的思考——分析当前情况、决定下一步做什么、为什么。
2. Action：基于思考，决定是否调用工具。如果需要信息，调用 get_weather；如果信息已足够，直接回复用户。
3. Observation：工具返回的结果会成为你的新观察，基于它进行下一轮 Thought。

【重要】
- 每次回复必须先以 "Thought: " 开头写出你的思考，再决定是否调用工具。
- 不要一次性调用所有可能的工具——先调用一个，看结果，再决定下一步。
- 当你认为信息足够回答用户时，用 Thought 说明，然后给出最终自然语言回复（不再调用工具）。

示例：
用户：北京天气怎么样？如果下雨就告诉我上海天气。
Thought：用户要北京天气，且条件性要上海天气。我先查北京天气，根据结果再决定是否查上海。
Action：调用 get_weather(city="北京")
Observation：{"city":"北京","temp":"28°C","condition":"晴"}
Thought：北京是晴天，不下雨，不需要查上海。可以直接回复用户。
最终回复：北京今天 28°C 晴天，没有下雨，所以不需要查上海天气。`;

const PLAIN_SYSTEM_PROMPT = '你是一个智能助手，可以查询城市天气。根据用户问题调用工具并回复。';

// ── ReAct Harness Loop ──

const MAX_STEPS = 8;

interface ReActStep {
  step: number;
  thought: string;
  action: { name: string; args: string; result: string } | null;
}

async function runReActHarness(task: string, systemPrompt: string, label: string): Promise<void> {
  console.log(`\n┌───────────────────────────────────────────`);
  console.log(`│ ▶ ${label}`);
  console.log(`└───────────────────────────────────────────`);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: task },
  ];

  const trace: ReActStep[] = [];

  for (let step = 1; step <= MAX_STEPS; step++) {
    const response = await client.chat.completions.create({ model: MODEL, messages, tools });
    const choice = response.choices[0];
    const toolCalls = choice.message.tool_calls;
    const thought = choice.message.content ?? '';

    console.log(`\n── [Step ${step}] ──`);

    // ReAct 模式下，content 是 Thought
    if (thought) {
      console.log(`💭 ${thought}`);
    }

    // 无工具调用 → 任务完成
    if (!toolCalls || toolCalls.length === 0) {
      trace.push({ step, thought, action: null });
      console.log(`✅ 任务完成（模型返回最终回复）`);
      break;
    }

    messages.push(choice.message);

    // ReAct 模式下，每步只应有一个工具调用（先思考再行动）
    for (const tc of toolCalls) {
      if (tc.type !== 'function') continue;
      const fn = toolMap[tc.function.name];
      let result: string;
      try {
        const args = JSON.parse(tc.function.arguments);
        result = fn ? fn(args) : JSON.stringify({ error: `未知工具: ${tc.function.name}` });
      } catch (error) {
        result = JSON.stringify({ error: `执行失败: ${error instanceof Error ? error.message : String(error)}` });
      }
      console.log(`🔧 Action: ${tc.function.name}(${tc.function.arguments})`);
      console.log(`👁️ Observation: ${result}`);

      trace.push({ step, thought, action: { name: tc.function.name, args: tc.function.arguments, result } });

      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: tc.id,
      } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);
    }

    if (step === MAX_STEPS) {
      console.log(`⚠️ 达到最大步数，强制终止`);
    }
  }

  console.log(`\n📊 ${label} | 总步数: ${trace.length} | 工具调用: ${trace.filter((t) => t.action).length}`);
}

// ── 主流程：对比实验 ──

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(`🧠 ReAct 推理模式对比实验 (${PROVIDER_NAME})`);
  console.log('═══════════════════════════════════════════');

  // 条件任务：需要基于第一次观察决定是否进行第二次行动
  const conditionalTask = '帮我查一下北京和深圳的天气。如果北京是晴天，就再查一下上海的天气；如果北京不是晴天，就不用查上海了。';

  console.log(`\n用户任务: ${conditionalTask}`);
  console.log(`（这是一个条件任务——是否查上海取决于北京的天气结果）`);

  // 实验 1：无 ReAct 约束（Stage 2 反射式）
  await runReActHarness(conditionalTask, PLAIN_SYSTEM_PROMPT, '实验 1：无 ReAct 约束（反射式）');

  // 实验 2：有 ReAct 约束
  await runReActHarness(conditionalTask, REACT_SYSTEM_PROMPT, '实验 2：有 ReAct 约束（先思考再行动）');

  console.log('\n═══════════════════════════════════════════');
  console.log('💡 小结:');
  console.log('   - 反射式：模型可能一次性调用多个工具，忽略"先看北京再决定"的条件逻辑。');
  console.log('   - ReAct：模型先查北京，看到"晴"后再决定查上海，行动基于观察、动态决策。');
  console.log('   - ReAct 的代价：多一轮思考输出，消耗 token 与延迟；复杂任务才值得用。');
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);

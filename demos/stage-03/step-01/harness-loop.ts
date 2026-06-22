/**
 * Stage 3 · Step 1: 从 while 循环到 Harness Loop
 *
 * 【学习目标】
 *   Stage 2 的 processTurn() 里有一个 while 循环——它能跑，但说不清。
 *   本步把这个"匿名循环"重构为显式的 Harness Loop（状态机 + 轨迹记录）。
 *
 * 【什么是 Harness Loop？】
 *   Harness = 挽具，套在 LLM 外层的控制装置。
 *   LLM 只负责"想"，Harness 负责"跑循环、执行工具、收集结果、决定何时停"。
 *
 *   ┌──────────────────────────────────────────────────┐
 *   │               🔄 Harness Loop                    │
 *   │                                                  │
 *   │   ┌────────┐     ┌────────┐     ┌────────┐      │
 *   │   │ 当前    │ ──→ │  LLM   │ ──→ │ 解析    │     │
 *   │   │ 状态    │     │ 决策   │     │ 执行    │      │
 *   │   │ State  │ ←── │        │ ←── │ 工具   │      │
 *   │   └───┬────┘     └────────┘     └────────┘      │
 *   │       │                                      │    │
 *   │       ▼                                      │    │
 *   │   done / max_steps / error ──→ 终止         │    │
 *   └──────────────────────────────────────────────────┘
 *
 * 本步仍用 Stage 2 的模拟工具（get_weather / calculate），聚焦循环骨架本身。
 */
import OpenAI from 'openai';
import { API_KEY, BASE_URL, MODEL, PROVIDER_NAME } from '../../common/config.js';

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

// ── 工具定义（复用 Stage 2 模拟工具） ──

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

const weatherData: Record<string, { temp: string; condition: string }> = {
  北京: { temp: '28°C', condition: '晴' },
  上海: { temp: '32°C', condition: '多云' },
  深圳: { temp: '35°C', condition: '雷阵雨' },
};

function getWeather(args: { city: string }): string {
  const weather = weatherData[args.city];
  if (weather) return JSON.stringify({ city: args.city, ...weather });
  return JSON.stringify({ error: `未找到城市"${args.city}"的天气数据` });
}

function calculate(args: { expression: string }): string {
  try {
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
  calculate: (args) => calculate(args as { expression: string }),
};

// ── Harness Loop 核心类型 ──

/**
 * AgentState：给循环的每种终止方式一个名字。
 *   running    → 循环进行中
 *   done       → 模型返回纯文本（无 tool_calls），任务完成
 *   max_steps  → 超过步数上限，防死循环
 *   error      → 不可恢复异常（如 LLM 请求失败）
 */
type AgentState = 'running' | 'done' | 'max_steps' | 'error';

/** 单步执行记录，循环结束后聚合为完整轨迹 */
interface HarnessStep {
  step: number;
  thought: string; // 模型输出的文本（思考/回复）
  actions: { name: string; args: string; result: string }[]; // 本步的工具调用
}

interface HarnessResult {
  state: AgentState;
  steps: HarnessStep[];
  finalReply: string;
  totalSteps: number;
}

const MAX_STEPS = 8;

// ── Harness Loop 主循环 ──

/**
 * 状态驱动的 Agent 执行内核。
 * 与具体工具无关——后续 step 只需换 tools / toolMap，本函数骨架不变。
 */
async function runHarness(task: string, maxSteps = MAX_STEPS): Promise<HarnessResult> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: '你是一个智能助手，可以查天气、做数学计算。根据用户问题自主调用工具，完成后用自然语言回复。',
    },
    { role: 'user', content: task },
  ];

  const steps: HarnessStep[] = [];
  let state: AgentState = 'running';
  let finalReply = '';

  for (let step = 1; step <= maxSteps; step++) {
    console.log(`\n── [Step ${step}/${maxSteps}] 状态: ${state} ──`);

    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await client.chat.completions.create({ model: MODEL, messages, tools });
    } catch (error) {
      state = 'error';
      console.log(`❌ LLM 请求失败: ${error instanceof Error ? error.message : String(error)}`);
      return { state, steps, finalReply, totalSteps: step - 1 };
    }

    const choice = response.choices[0];
    const toolCalls = choice.message.tool_calls;
    const thought = choice.message.content ?? '';

    const harnessStep: HarnessStep = { step, thought, actions: [] };

    // 终止条件 1：模型返回纯文本，任务完成
    // 判断依据是"无 tool_calls"——不是 finish_reason
    if (!toolCalls || toolCalls.length === 0) {
      console.log(`💭 回复: ${thought}`);
      finalReply = thought;
      state = 'done';
      steps.push(harnessStep);
      break;
    }

    // 模型决定调用工具 → 执行 → 结果回写 → 下一轮继续
    if (thought) console.log(`💭 Thought: ${thought}`);
    messages.push(choice.message);

    for (const tc of toolCalls) {
      if (tc.type !== 'function') continue;
      const fn = toolMap[tc.function.name];

      let result: string;
      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = JSON.parse(tc.function.arguments);
        result = fn ? fn(parsedArgs) : JSON.stringify({ error: `未知工具: ${tc.function.name}` });
      } catch (error) {
        parsedArgs = {};
        result = JSON.stringify({ error: `工具执行失败: ${error instanceof Error ? error.message : String(error)}` });
      }

      console.log(`   🔧 ${tc.function.name}(${tc.function.arguments}) → ${result}`);
      harnessStep.actions.push({ name: tc.function.name, args: tc.function.arguments, result });

      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: tc.id,
      } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);
    }

    steps.push(harnessStep);

    // 终止条件 2：达到步数上限，防止死循环
    if (step === maxSteps) {
      state = 'max_steps';
      console.log(`⚠️ 达到最大步数 ${maxSteps}，强制终止`);
    }
  }

  return { state, steps, finalReply, totalSteps: steps.length };
}

// ── 实验任务 ──

/**
 * 三个实验，分别演示 Harness Loop 的不同终止路径和状态流转：
 *
 * 实验 1: done（多步）     → Agent 需要调 2 次工具再做推理，然后回复 → 多步后 done
 * 实验 2: done（单步）     → 纯闲聊，Agent 不调用工具 → 第 1 步就 done
 * 实验 3: max_steps       → 故意把上限压到 2 步，让 Agent 来不及完成任务 → max_steps
 */
const experiments = [
  {
    task: '北京和深圳今天天气怎么样？哪个温度更高？',
    desc: '终止条件 done（多步）',
    hint: 'Agent 需要先调两次 get_weather，再基于结果推理，最后回复 → 观察多步状态流转',
    maxSteps: MAX_STEPS,
  },
  {
    task: '你好，介绍一下你自己',
    desc: '终止条件 done（第 1 步就完成）',
    hint: 'Agent 不需要调用工具 → 观察第 1 步直接 done',
    maxSteps: MAX_STEPS,
  },
  {
    task: '北京和深圳今天天气怎么样？哪个温度更高？',
    desc: '终止条件 max_steps（步数不够用）',
    hint: '故意把 MAX_STEPS 压到 2 → Agent 还没来得及推理就被强制终止',
    maxSteps: 2,
  },
];

// ── 主流程 ──

async function main() {
  // ── 1. 先画图：让读者"看到" Harness Loop 长什么样 ──

  console.log('═══════════════════════════════════════════');
  console.log(`🔁 Stage 3 · Step 1: Harness Loop (${PROVIDER_NAME})`);
  console.log('═══════════════════════════════════════════');

  console.log(`
┌──────────────────────────────────────────────────────┐
│               🔄 Harness Loop = Agent 的执行引擎        │
│                                                      │
│   Harness = 挽具，套在 LLM 外层的控制装置。               │
│   LLM 只负责"想"，Harness 负责"跑、停、记"。            │
│                                                      │
│   ┌────────┐     ┌────────┐     ┌────────┐          │
│   │ 当前    │ ──→ │  LLM   │ ──→ │ 解析    │         │
│   │ 状态    │     │ 决策   │     │ 执行    │          │
│   │ State  │ ←── │        │ ←── │ 工具   │          │
│   └───┬────┘     └────────┘     └────────┘          │
│       │                                        │     │
│       ▼                                        │     │
│   done / max_steps / error  ──→ 终止           │     │
│                                                      │
│   三种终止条件:                                        │
│     done       → 模型返回纯文本，任务完成               │
│     max_steps  → 超过步数上限，防死循环                 │
│     error      → 不可恢复异常                          │
└──────────────────────────────────────────────────────┘
`);

  // ── 2. 三个实验：让读者通过观察状态流转来理解 Harness Loop ──

  for (const { task, desc, hint, maxSteps } of experiments) {
    console.log('\n═══════════════════════════════════════════');
    console.log(`🔬 实验: ${desc}`);
    console.log(`  用户: ${task}`);
    console.log(`  💡 ${hint}`);
    if (maxSteps !== MAX_STEPS) console.log(`  ⚙️ MAX_STEPS = ${maxSteps}（故意压低以触发终止）`);
    console.log('═══════════════════════════════════════════');

    const result = await runHarness(task, maxSteps);

    console.log(`\n📊 轨迹摘要:`);
    console.log(`  终止状态: ${result.state}`);
    console.log(`  总步数: ${result.totalSteps}`);
    console.log(`  工具调用次数: ${result.steps.reduce((sum, s) => sum + s.actions.length, 0)}`);

    if (result.finalReply) {
      console.log(
        `  最终回复: ${result.finalReply.slice(0, 120)}${result.finalReply.length > 120 ? '...' : ''}`,
      );
    }
  }

  // ── 3. 小结 ──

  console.log('\n═══════════════════════════════════════════');
  console.log('💡 小结：');
  console.log('═══════════════════════════════════════════');
  console.log('   Harness Loop 本质：状态 → LLM 决策 → 执行 → 观察 → 更新状态 → 终止');
  console.log('');
  console.log('   🔹 AgentState —— 让你知道 Agent 停在哪、为什么停');
  console.log('      done       → 任务完成（模型返回纯文本）');
  console.log('      max_steps  → 步数用完，防止无限循环');
  console.log('      error      → 不可恢复异常');
  console.log('');
  console.log('   🔹 HarnessStep —— 每步留下轨迹，事后可回溯');
  console.log('      结构化记录：第几步、想了什么、调了什么工具、结果是什么');
  console.log('');
  console.log('   🔹 runHarness() 与工具无关 —— 后续 step 只需换工具集，骨架不变');
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);

/**
 * Stage 3 · Step 5: 滑动窗口上下文截断
 * 目标：落地 README 辅助措施"从 Stage 3 起强制实现历史对话滑动窗口截断"。
 *       实现 token 估算 + 滑动窗口截断，让长任务不因上下文爆炸而失败。
 *
 * 截断策略：
 *   - 永远保留 system 消息（Agent 人格不能丢）
 *   - 保留最近 N 条消息（短期记忆）
 *   - 丢弃中间历史
 *   - 关键：不能打破 tool_calls 与 tool 消息的配对（API 要求 tool 消息前
 *     必须有对应的 assistant tool_calls，否则报 400）
 *
 * 截断时机：惰性触发——仅当估算 token 超过阈值时才截断，避免每轮开销。
 */
import OpenAI from 'openai';
import { API_KEY, BASE_URL, MODEL, PROVIDER_NAME } from '../../common/config.js';

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

// ── 工具定义（用 calculate 制造大量工具调用消息） ──

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'calculate',
      description: '执行数学计算，支持加减乘除',
      parameters: {
        type: 'object',
        properties: {
          expression: { type: 'string', description: '数学表达式，如"1+1"' },
        },
        required: ['expression'],
      },
    },
  },
];

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
  calculate: (args) => calculate(args as { expression: string }),
};

// ── Token 估算（字符数 ÷ 4，中英文混合经验值，零依赖） ──

function estimateTokens(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): number {
  // JSON.stringify 后按字符数 ÷ 4 近似；含 role/content/tool_calls 等结构开销
  const text = JSON.stringify(messages);
  return Math.ceil(text.length / 4);
}

// ── 滑动窗口截断 ──

const TOKEN_THRESHOLD = 2000; // 估算 token 超过此值则触发截断
const KEEP_RECENT = 6; // 保留最近 N 条消息（不含 system）——故意压低，让截断效果可见

/**
 * 滑动窗口截断：保留 system + 最近 keepRecent 条，丢弃中间历史。
 * 处理 tool_calls/tool 配对：截断后扫描，丢弃孤立的 tool 消息。
 */
function truncateMessages(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  keepRecent: number = KEEP_RECENT,
): { truncated: boolean; dropped: number; savedTokens: number } {
  const beforeTokens = estimateTokens(messages);

  // 找到 system 消息（通常在开头）
  const systemMsgs = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');

  // 不足保留量，无需截断
  if (nonSystem.length <= keepRecent) {
    return { truncated: false, dropped: 0, savedTokens: 0 };
  }

  // 保留最近 keepRecent 条
  const kept = nonSystem.slice(-keepRecent);

  // 处理配对：扫描保留部分，丢弃孤立的 tool 消息
  // （其对应的 assistant tool_calls 已被丢弃）
  const knownToolCallIds = new Set<string>();
  for (const m of kept) {
    if (m.role === 'assistant' && m.tool_calls) {
      for (const tc of m.tool_calls) {
        if (tc.id) knownToolCallIds.add(tc.id);
      }
    }
  }

  const cleaned: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  for (const m of kept) {
    if (m.role === 'tool') {
      const toolMsg = m as OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
      if (toolMsg.tool_call_id && !knownToolCallIds.has(toolMsg.tool_call_id)) {
        // 孤立的 tool 消息，丢弃
        continue;
      }
    }
    cleaned.push(m);
  }

  const dropped = nonSystem.length - kept.length;
  messages.length = 0;
  messages.push(...systemMsgs, ...cleaned);

  const afterTokens = estimateTokens(messages);
  return { truncated: true, dropped, savedTokens: beforeTokens - afterTokens };
}

// ── Harness Loop（带上下文截断） ──

const MAX_STEPS = 60; // 故意设大，制造长任务（40 个算式每轮算一个就要 40+ 步）

async function runHarness(task: string): Promise<void> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: '你是一个计算助手。用户会给你一系列算式，请严格按顺序逐个用 calculate 工具计算——每次回复只调用一次工具，算完一个再算下一个。全部算完后汇总所有结果。',
    },
    { role: 'user', content: task },
  ];

  let truncationCount = 0;
  let totalDropped = 0;

  for (let step = 1; step <= MAX_STEPS; step++) {
    // 每轮请求前检查是否需要截断
    const beforeTokens = estimateTokens(messages);
    if (beforeTokens > TOKEN_THRESHOLD) {
      const result = truncateMessages(messages);
      if (result.truncated) {
        truncationCount++;
        totalDropped += result.dropped;
        console.log(
          `   ✂️ 上下文截断: 丢弃 ${result.dropped} 条消息，节省约 ${result.savedTokens} tokens（${beforeTokens} → ${estimateTokens(messages)}）`,
        );
      }
    }

    const response = await client.chat.completions.create({ model: MODEL, messages, tools });
    const choice = response.choices[0];
    const toolCalls = choice.message.tool_calls;
    const thought = choice.message.content ?? '';

    console.log(`[Step ${step}/${MAX_STEPS}] tokens≈${estimateTokens(messages)} | ${thought ? '💭 ' + thought.slice(0, 60) : ''}`);

    if (!toolCalls || toolCalls.length === 0) {
      console.log(`\n✅ 最终回复:\n${thought}`);
      break;
    }

    messages.push(choice.message);

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
      console.log(`   🔧 ${tc.function.name}(${tc.function.arguments}) → ${result}`);
      messages.push({
        role: 'tool',
        content: result,
        tool_call_id: tc.id,
      } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);
    }

    if (step === MAX_STEPS) console.log(`⚠️ 达到最大步数，强制终止`);
  }

  console.log(`\n📊 截断统计: 触发 ${truncationCount} 次，累计丢弃 ${totalDropped} 条消息`);
}

// ── 主流程 ──

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(`✂️ 滑动窗口上下文截断 (${PROVIDER_NAME})`);
  console.log(`   token 阈值: ${TOKEN_THRESHOLD} | 保留最近: ${KEEP_RECENT} 条 | 最大步数: ${MAX_STEPS}`);
  console.log('═══════════════════════════════════════════');

  // 制造长任务：40 个算式，让 Agent 每个都调用一次工具，必然触发多次截断
  const expressions = [
    '1 + 1', '2 * 3', '10 - 4', '100 / 5', '7 + 8',
    '9 * 9', '50 - 23', '144 / 12', '3 + 4 + 5', '6 * 7',
    '100 + 200', '99 - 33', '81 / 9', '11 * 11', '42 + 58',
    '8 * 12', '15 + 27', '200 - 88', '63 / 7', '13 * 4',
    '77 + 23', '5 * 15', '90 - 45', '120 / 8', '19 + 31',
    '4 * 25', '66 - 19', '55 + 45', '72 / 6', '14 * 5',
    '33 + 67', '7 * 8', '150 - 75', '98 / 7', '22 + 18',
    '9 * 6', '84 - 39', '110 / 5', '16 + 24', '3 * 17',
  ];
  const task = `请帮我依次计算以下算式，每算一个就调用一次 calculate 工具（不要一次性调用多个）：
${expressions.map((e, i) => `${i + 1}. ${e}`).join('\n')}

全部算完后，请回答两个问题：
1. 所有结果的总和是多少？
2. 第 1 个算式（${expressions[0]}）的结果是多少？`;

  console.log(`\n用户任务: 计算 ${expressions.length} 个算式（制造长任务触发截断）`);
  console.log(`   ⚠️ 注意最后会问"第 1 个算式的结果"——截断后早期消息已被丢弃，看 Agent 是否还记得\n`);

  await runHarness(task);

  console.log('\n═══════════════════════════════════════════');
  console.log('💡 小结:');
  console.log('   - 工具调用消息膨胀快：每轮 +2 条（assistant+tool），40 个算式必然触发多次截断。');
  console.log('   - 截断后 Agent 仍能继续计算——靠的是"保留最近 N 条"的短期记忆。');
  console.log('   - 截断的代价（关注最后两个问题）:');
  console.log('     · "总和"——早期结果已丢失，汇总大概率不准。');
  console.log('     · "第 1 个算式的结果"——那条 tool 消息早已被丢弃，Agent 应该答不上来。');
  console.log('   - 这正是 Stage 4 RAG 要解决的问题：用外部记忆替代易失的上下文。');
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);

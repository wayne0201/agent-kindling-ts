/**
 * Stage 2 · Step 2 · Case 2: tool_choice 参数对比
 * 目标：理解 tool_choice（auto / none / required）如何控制模型是否调用工具。
 *
 * 关键设计：
 *   用一个"本该用工具"的问题（查天气）跑三种取值。
 *   - auto：模型该调就调 → 回复基于真实工具数据
 *   - none：禁止调用 → 模型没有数据源，只能凭空编造（这正是工具的价值所在）
 *   - required：强制调用 → 一定调，哪怕问题不那么需要
 *   三者差异体现在"调没调工具 / 回复靠数据还是靠编"，而不是最终文本长度。
 */
import OpenAI from 'openai';
import { MODEL, PROVIDER_NAME, chatWithTools } from './_shared.js';

// 故意用"该用工具"的问题：auto 下应调 get_weather，none 下被迫瞎编
const QUERY = '深圳现在天气怎么样？';

const choices: { label: string; value: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption }[] = [
  { label: 'auto（默认，模型自主决定）', value: 'auto' },
  { label: 'none（禁止调用工具）', value: 'none' },
  { label: 'required（强制调用工具）', value: 'required' },
];

async function main() {
  console.log('┌───────────────────────────────────────────┐');
  console.log('│  Case 2：tool_choice 参数对比实验         │');
  console.log(`│  (${PROVIDER_NAME} / ${MODEL})│`);
  console.log('└───────────────────────────────────────────┘\n');

  console.log(`用户: ${QUERY}`);
  console.log(`（这是本该调用 get_weather 的问题，观察三种取值下模型行为差异）\n`);

  for (const { label, value } of choices) {
    console.log(`▶ tool_choice = ${label}`);
    try {
      const trace = await chatWithTools(QUERY, value);

      if (trace.calledTools) {
        const detail = trace.toolInvocations.map((t) => `${t.name}(${t.args})`).join('  ');
        console.log(`  🔧 调用了工具: ${detail}`);
        console.log(`  📦 工具返回: ${trace.toolResults.join('  ')}`);
        console.log(`  💬 回复: ${trace.reply.slice(0, 120)}${trace.reply.length > 120 ? '...' : ''}`);
      } else {
        console.log(`  🚫 未调用任何工具（模型在没有数据源的情况下直接回答）`);
        console.log(`  💬 回复: ${trace.reply}`);
      }
    } catch (error) {
      console.log(`  ⚠️ 报错（预期行为）: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log();
  }

  console.log('💡 小结:');
  console.log('   - auto:     该调就调，回复基于工具返回的真实数据（深圳 35°C 雷阵雨）');
  console.log('   - none:     禁止调用，模型没有数据源，只能凭印象编造天气（注意它"编"得多自信）');
  console.log('   - required: 强制调用，即便问题不迫切也会调一次工具');
  console.log('   → 这就是"让模型用工具"而非"让模型凭记忆"的意义：避免幻觉、数据可追溯。');
}

main().catch(console.error);

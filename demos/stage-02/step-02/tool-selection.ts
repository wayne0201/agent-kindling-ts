/**
 * Stage 2 · Step 2 · Case 1: 多工具选择准确性
 * 目标：注册多个工具后，观察模型能否根据用户意图自主选对工具。
 *       覆盖天气 / 时间 / 计算 / 纯闲聊四类意图。
 */
import { MODEL, PROVIDER_NAME, tools, chatWithTools } from './_shared.js';

// ── 测试用例：覆盖不同意图 ──

const testCases = [
  { query: '北京今天天气怎么样？', expectedTool: 'get_weather', desc: '天气问题' },
  { query: '现在几点了？', expectedTool: 'get_time', desc: '时间问题' },
  { query: '帮我算一下 123 乘以 456 等于多少', expectedTool: 'calculate', desc: '数学计算' },
  { query: '你好，介绍一下你自己', expectedTool: '(无工具)', desc: '纯闲聊（不应调用工具）' },
];

// ── 主流程 ──

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(`🔧 Case 1：多工具选择准确性 (${PROVIDER_NAME} / ${MODEL})`);
  console.log(`   已注册工具: ${tools.map((t) => ('function' in t ? t.function.name : t.type)).join(', ')}`);
  console.log('═══════════════════════════════════════════\n');

  for (const tc of testCases) {
    console.log(`▶ ${tc.desc}`);
    console.log(`  用户: ${tc.query}`);
    console.log(`  期望工具: ${tc.expectedTool}`);
    const trace = await chatWithTools(tc.query);
    if (trace.calledTools) {
      const names = trace.toolInvocations.map((t) => t.name).join(', ');
      console.log(`  实际调用: ${names}`);
    } else {
      console.log(`  实际调用: (无)`);
    }
    console.log(`  回复: ${trace.reply.slice(0, 120)}${trace.reply.length > 120 ? '...' : ''}`);
    console.log();
  }

  console.log('═══════════════════════════════════════════');
  console.log('✅ 工具选择准确性实验完成');
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);

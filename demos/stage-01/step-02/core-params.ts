/**
 * Step 2: 掌控核心参数
 * 目标：深入理解 temperature、top_p、max_tokens 对生成结果的影响。
 * 实验：
 *   1. temperature 对比 —— 0.1 vs 0.9，各请求 5 次，统计去重。
 *   2. top_p 对比 —— 固定 temperature，0.1 vs 0.9，各请求 5 次，统计去重。
 *   3. max_tokens 截断 —— 15 / 50 / 200 三档，观察截断与 finish_reason。
 */
import OpenAI from 'openai';
import { API_KEY, BASE_URL, MODEL, PROVIDER_NAME } from '../../common/config.js';

// 初始化 OpenAI 客户端
const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

const ROUNDS = 5;

// 固定的测试 Prompt，刻意开放以放大参数差异
const FIXED_MESSAGES: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
  { role: 'system', content: '你是一位富有想象力的作家。' },
  { role: 'user', content: '用一句话描述"夜晚的星空"。' },
];

type ChatParams = Pick<
  OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  'temperature' | 'top_p' | 'max_tokens'
>;

/**
 * 在指定参数下请求 ROUNDS 次，返回所有回复。
 */
async function generateWithParams(params: ChatParams): Promise<string[]> {
  const results: string[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: FIXED_MESSAGES,
      ...params,
    });
    results.push(response.choices[0].message.content ?? '');
  }
  return results;
}

/**
 * 打印一组实验结果：逐条输出 + 去重统计。
 */
function printGroup(title: string, results: string[]): void {
  console.log(`\n── ${title} ──`);
  results.forEach((text, i) => console.log(`  [${i + 1}] ${text}`));
  const unique = new Set(results.map((t) => t.trim())).size;
  console.log(`  📊 去重统计: ${unique}/${ROUNDS} 种不同回复`);
}

async function main() {
  console.log(`⏳ 正在向 ${PROVIDER_NAME} 发送对比请求...\n`);

  try {
    // ===== 实验 1：temperature 对比 =====
    console.log('═══════════════════════════════════════════');
    console.log('🌡️  实验 1：temperature 对比 (top_p 取默认)');
    console.log('═══════════════════════════════════════════');

    const [lowTemp, highTemp] = await Promise.all([
      generateWithParams({ temperature: 0.1 }),
      generateWithParams({ temperature: 0.9 }),
    ]);

    printGroup('temperature = 0.1（保守、稳定）', lowTemp);
    printGroup('temperature = 0.9（发散、多样）', highTemp);
    console.log('\n💡 小结: 低 temperature 趋于重复，高 temperature 趋于多样。');

    // ===== 实验 2：top_p 对比 =====
    console.log('\n═══════════════════════════════════════════');
    console.log('🎯 实验 2：top_p 对比 (temperature 固定为 0.9)');
    console.log('═══════════════════════════════════════════');

    const [lowTopP, highTopP] = await Promise.all([
      generateWithParams({ temperature: 0.9, top_p: 0.1 }),
      generateWithParams({ temperature: 0.9, top_p: 0.9 }),
    ]);

    printGroup('top_p = 0.1（只从最高概率 token 采样，趋保守）', lowTopP);
    printGroup('top_p = 0.9（候选集更大，趋多样）', highTopP);
    console.log('\n💡 小结: top_p 越小候选越窄越确定，越大越多样；与 temperature 正交可叠加。');

    // ===== 实验 3：max_tokens 截断 =====
    console.log('\n═══════════════════════════════════════════');
    console.log('📐 实验 3：max_tokens 截断 (三档对比)');
    console.log('═══════════════════════════════════════════');

    const longMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'user', content: '详细介绍 TypeScript 的类型系统。' },
    ];
    const tokenLimits = [15, 50, 200];

    for (const maxTokens of tokenLimits) {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: longMessages,
        max_tokens: maxTokens,
      });
      const choice = response.choices[0];
      console.log(`\n── max_tokens = ${maxTokens} ──`);
      console.log(`  输出: ${choice.message.content}`);
      console.log(`  📊 finish_reason: ${choice.finish_reason} （"length"=被截断, "stop"=自然结束）`);
      console.log(`  📊 completion_tokens: ${response.usage?.completion_tokens}`);
    }
    console.log('\n💡 小结: max_tokens 是输出预算上限，超出即截断；生产中需结合 finish_reason 判断完整性。');
  } catch (error) {
    console.error('❌ 请求失败:', error);
  }
}

main();

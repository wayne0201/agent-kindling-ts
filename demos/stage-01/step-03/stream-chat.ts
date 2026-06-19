/**
 * Step 3: 流式输出的艺术 —— SSE 打字机
 * 目标：理解 Server-Sent Events (SSE)，掌握 stream: true 参数，
 *       实现终端「打字机」效果逐字打印，正确处理 chunk 数据拼接。
 */
import OpenAI from 'openai';
import { API_KEY, BASE_URL, MODEL, PROVIDER_NAME } from '../../common/config.js';

// 初始化 OpenAI 客户端
const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

/**
 * 流式请求：逐 chunk 打印，实现打字机效果。
 * 同时拼接完整回复，最后统计 token 消耗。
 */
async function streamChat() {
  console.log(`⏳ 正在以流式方式向 ${PROVIDER_NAME} 发送请求...\n`);

  const stream = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: '你是一位严谨但充满热情的编程导师。' },
      { role: 'user', content: '用三句话解释什么是 Server-Sent Events (SSE)。' },
    ],
    stream: true,
  });

  let fullContent = ''; // 拼接完整回复
  let chunkCount = 0; // 统计 chunk 数量

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    const content = delta?.content ?? '';

    if (content) {
      process.stdout.write(content); // 逐字打印，不换行
      fullContent += content;
      chunkCount++;
    }

    // 检测流结束
    if (chunk.choices[0]?.finish_reason) {
      const reason = chunk.choices[0].finish_reason;
      console.log(`\n\n📊 流结束: finish_reason = ${reason}`);
    }
  }

  // 打印汇总信息
  console.log(`📝 完整回复（共 ${fullContent.length} 字符，${chunkCount} 个有效 chunk）:`);
  console.log('─'.repeat(40));
  console.log(fullContent);
  console.log('─'.repeat(40));
}

/**
 * 对比实验：流式 vs 非流式
 * 验证流式拼接的完整内容与非流式请求一致。
 */
async function compareStreamVsNonStream() {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: '你是一位严谨但充满热情的编程导师。' },
    { role: 'user', content: '用一句话回答：什么是流式输出？' },
  ];

  // 非流式请求
  const nonStreamResponse = await client.chat.completions.create({
    model: MODEL,
    messages,
    stream: false,
  });
  const nonStreamContent = nonStreamResponse.choices[0].message.content ?? '';

  // 流式请求
  const stream = await client.chat.completions.create({
    model: MODEL,
    messages,
    stream: true,
  });

  let streamContent = '';
  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content ?? '';
    streamContent += content;
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('🔬 对比实验：流式拼接 vs 非流式');
  console.log('═══════════════════════════════════════════');
  console.log(`\n非流式结果: ${nonStreamContent}`);
  console.log(`流式拼接结果: ${streamContent}`);
  console.log(`\n📊 内容一致: ${nonStreamContent === streamContent ? '✅ 是' : '❌ 否（模型随机性导致，属正常现象）'}`);
}

async function main() {
  try {
    // 实验 1：流式打字机效果
    await streamChat();

    // 实验 2：流式 vs 非流式对比
    await compareStreamVsNonStream();
  } catch (error) {
    console.error('❌ 请求失败:', error);
  }
}

main();

/**
 * Day 1: 环境破冰与第一次调用
 * 目标：理解 OpenAI 兼容协议，成功与 LLM 通信，并实现环境防呆。
 */
import OpenAI from 'openai';
import { API_KEY, BASE_URL, MODEL, PROVIDER_NAME } from '../../common/config.js';

// 初始化 OpenAI 客户端，指向兼容端点
const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

// 4. 核心调用逻辑
async function main() {
  console.log(`⏳ 正在向 ${PROVIDER_NAME} 发送请求...`);

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: '你是一位严谨但充满热情的编程导师。' },
        { role: 'user', content: '用一句话告诉我，什么是 AI Agent？' },
      ],
    });

    console.log('\n✅ 收到回复:');
    console.log(response.choices[0].message.content);
    
    console.log('\n📊 Token 消耗:');
    console.log(`Prompt tokens: ${response.usage?.prompt_tokens}`);
    console.log(`Completion tokens: ${response.usage?.completion_tokens}`);
  } catch (error) {
    console.error('❌ 请求失败:', error);
  }
}

main();

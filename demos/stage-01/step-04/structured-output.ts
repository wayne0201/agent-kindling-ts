/**
 * Step 4: System Prompt 与结构化输出
 * 目标：掌握 System Prompt 人格设定，利用 XML/JSON 标签约束输出格式，并用代码解析提取。
 *
 * 实验：
 *   1. XML 结构化输出 —— 毒舌审查员，输出 <评价>...</评价><修改建议>...</修改建议>
 *   2. JSON 结构化输出 —— 要求返回 JSON 对象，代码解析提取字段
 */
import OpenAI from 'openai';
import { API_KEY, BASE_URL, MODEL, PROVIDER_NAME } from '../../common/config.js';

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

/**
 * 实验 1：XML 结构化输出
 * 设定「毒舌审查员」人格，要求用 XML 标签包裹评价与修改建议。
 */
async function xmlStructuredOutput() {
  console.log('═══════════════════════════════════════════');
  console.log('📝 实验 1：XML 结构化输出 —— 毒舌审查员');
  console.log('═══════════════════════════════════════════\n');

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `你是一位毒舌但专业的代码审查员。对用户提交的代码进行毫不留情的评价。
你必须严格按以下 XML 格式输出，不要输出任何 XML 标签之外的内容：
<评价>你对代码的毒舌评价</评价>
<修改建议>具体的改进建议</修改建议>`,
      },
      {
        role: 'user',
        content: '请审查这段代码：function add(a, b) { return a + b; }',
      },
    ],
  });

  const content = response.choices[0].message.content ?? '';
  console.log('原始输出:');
  console.log(content);
  console.log();

  // 用正则提取 XML 字段
  const ratingMatch = content.match(/<评价>([\s\S]*?)<\/评价>/);
  const suggestionMatch = content.match(/<修改建议>([\s\S]*?)<\/修改建议>/);

  console.log('── 解析结果 ──');
  console.log(`评价: ${ratingMatch?.[1]?.trim() ?? '❌ 未匹配到 <评价> 标签'}`);
  console.log(`修改建议: ${suggestionMatch?.[1]?.trim() ?? '❌ 未匹配到 <修改建议> 标签'}`);
}

/**
 * 实验 2：JSON 结构化输出
 * 要求模型返回 JSON 对象，代码用 JSON.parse 解析。
 */
async function jsonStructuredOutput() {
  console.log('\n═══════════════════════════════════════════');
  console.log('📋 实验 2：JSON 结构化输出');
  console.log('═══════════════════════════════════════════\n');

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: `你是一个代码分析助手。用户会给你一段代码，你需要分析并返回 JSON 格式的结果。
严格返回如下 JSON 对象，不要输出任何 JSON 之外的内容（包括 markdown 代码块标记）：
{"language": "编程语言", "complexity": "低/中/高", "issues": ["问题1", "问题2"], "suggestion": "改进建议"}`,
      },
      {
        role: 'user',
        content: 'function fibonacci(n) { if (n <= 1) return n; return fibonacci(n-1) + fibonacci(n-2); }',
      },
    ],
  });

  const content = response.choices[0].message.content ?? '';
  console.log('原始输出:');
  console.log(content);
  console.log();

  // 尝试提取 JSON（兼容 markdown 代码块包裹的情况）
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, content];
  const jsonStr = jsonMatch[1].trim();

  try {
    const parsed = JSON.parse(jsonStr);
    console.log('── 解析结果 ──');
    console.log(`语言: ${parsed.language}`);
    console.log(`复杂度: ${parsed.complexity}`);
    console.log(`问题列表: ${parsed.issues?.join(', ') ?? '无'}`);
    console.log(`改进建议: ${parsed.suggestion}`);
  } catch {
    console.log('❌ JSON 解析失败，模型输出格式不符合预期');
    console.log('这是结构化输出的常见问题——模型不一定 100% 遵守格式约束');
  }
}

async function main() {
  try {
    await xmlStructuredOutput();
    await jsonStructuredOutput();
  } catch (error) {
    console.error('❌ 请求失败:', error);
  }
}

main();

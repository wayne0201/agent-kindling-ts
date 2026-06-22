/**
 * Stage 3 · Step 6: 交付物 —— 极简自主编码 Agent
 * 目标：整合前五步能力，交付能自主"写脚本 → 执行 → 看报错 → 修复 → 再执行"的编码 Agent。
 *
 * 整合清单：
 *   ✅ Step 1: Harness Loop 状态驱动循环（runHarness）
 *   ✅ Step 2: ReAct 推理模式（System Prompt 约束先思考再行动）
 *   ✅ Step 3: 文件操作工具（read_file / write_file / list_dir，路径限制）
 *   ✅ Step 4: 脚本执行工具（run_script，超时 + 输出截断）
 *   ✅ Step 5: 滑动窗口上下文截断（惰性触发，保留 system + 最近 N 条）
 *
 * 这是 Phase 1 筑基期的终极交付物，也是 Stage 9 全栈研发流水线 Agent 的原型。
 */
import OpenAI from 'openai';
import * as readline from 'node:readline/promises';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { API_KEY, BASE_URL, MODEL, PROVIDER_NAME } from '../../common/config.js';

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

// ═══════════════════════════════════════════════
// 工作目录
// ═══════════════════════════════════════════════

const WORKSPACE_DIR = path.resolve(import.meta.dirname, '../workspace');
fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

type ToolResult = { ok: boolean; data?: string; error?: string };

function resolveSafePath(filename: string): { ok: true; absPath: string } | { ok: false; error: string } {
  if (!filename) return { ok: false, error: '缺少文件名参数' };
  const absPath = path.resolve(WORKSPACE_DIR, filename);
  if (!absPath.startsWith(WORKSPACE_DIR + path.sep) && absPath !== WORKSPACE_DIR) {
    return { ok: false, error: `路径越界："${filename}" 不在工作目录内` };
  }
  return { ok: true, absPath };
}

// ═══════════════════════════════════════════════
// 工具实现
// ═══════════════════════════════════════════════

function readFile(args: { filename?: string }): ToolResult {
  const resolved = resolveSafePath(args.filename ?? '');
  if (!resolved.ok) return { ok: false, error: resolved.error };
  try {
    if (!fs.existsSync(resolved.absPath)) return { ok: false, error: `文件不存在: ${args.filename}` };
    return { ok: true, data: fs.readFileSync(resolved.absPath, 'utf-8') };
  } catch (error) {
    return { ok: false, error: `读取失败: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function writeFile(args: { filename?: string; content?: string }): ToolResult {
  const resolved = resolveSafePath(args.filename ?? '');
  if (!resolved.ok) return { ok: false, error: resolved.error };
  if (args.content === undefined) return { ok: false, error: '缺少 content 参数' };
  try {
    fs.mkdirSync(path.dirname(resolved.absPath), { recursive: true });
    fs.writeFileSync(resolved.absPath, args.content, 'utf-8');
    return { ok: true, data: `已写入 ${args.filename}（${args.content.length} 字符）` };
  } catch (error) {
    return { ok: false, error: `写入失败: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function listDir(args: { dirname?: string }): ToolResult {
  const target = args.dirname ?? '.';
  const resolved = resolveSafePath(target);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  try {
    if (!fs.existsSync(resolved.absPath)) return { ok: false, error: `目录不存在: ${target}` };
    const entries = fs.readdirSync(resolved.absPath, { withFileTypes: true });
    const listing = entries.map((e) => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`);
    return { ok: true, data: listing.length ? listing.join('\n') : '(空目录)' };
  } catch (error) {
    return { ok: false, error: `列目录失败: ${error instanceof Error ? error.message : String(error)}` };
  }
}

const SCRIPT_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_CHARS = 2000;

function truncateOutput(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_OUTPUT_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_OUTPUT_CHARS) + `\n... [输出已截断，共 ${text.length} 字符]`, truncated: true };
}

function runScript(args: { filename?: string }): Promise<ToolResult> {
  return new Promise((resolve) => {
    const resolved = resolveSafePath(args.filename ?? '');
    if (!resolved.ok) {
      resolve({ ok: false, error: resolved.error });
      return;
    }
    if (!fs.existsSync(resolved.absPath)) {
      resolve({ ok: false, error: `脚本不存在: ${args.filename}` });
      return;
    }

    const startTime = Date.now();
    execFile(
      'npx',
      ['tsx', resolved.absPath],
      { timeout: SCRIPT_TIMEOUT_MS, maxBuffer: 1024 * 1024, cwd: WORKSPACE_DIR },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        const out = truncateOutput(stdout.toString());
        const err = truncateOutput(stderr.toString());
        const timedOut = !!error && (error as NodeJS.ErrnoException & { signal?: string }).signal === 'SIGTERM';
        const exitCode = error ? (error as NodeJS.ErrnoException).code ?? -1 : 0;

        if (timedOut) {
          resolve({ ok: false, error: `脚本执行超时（${SCRIPT_TIMEOUT_MS}ms），已终止` });
          return;
        }

        resolve({
          ok: exitCode === 0,
          data: JSON.stringify({ exitCode, durationMs, stdout: out.text, stderr: err.text, truncated: out.truncated || err.truncated }),
        });
      },
    );
  });
}

// ═══════════════════════════════════════════════
// 工具定义与映射
// ═══════════════════════════════════════════════

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取工作目录下的文件内容。filename 为相对路径。',
      parameters: {
        type: 'object',
        properties: { filename: { type: 'string', description: '相对于工作目录的文件路径' } },
        required: ['filename'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '在工作目录下创建或覆盖文件。filename 为相对路径，content 为写入的文本内容。',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: '相对于工作目录的文件路径，如 "fib.ts"' },
          content: { type: 'string', description: '要写入的文本内容' },
        },
        required: ['filename', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: '列出工作目录（或其子目录）下的文件和子目录。',
      parameters: {
        type: 'object',
        properties: { dirname: { type: 'string', description: '相对目录路径，默认为根目录' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_script',
      description: '用 tsx 执行工作目录下的 TypeScript/JavaScript 脚本，返回 stdout、stderr、退出码和耗时。脚本需先用 write_file 创建。',
      parameters: {
        type: 'object',
        properties: { filename: { type: 'string', description: '要执行的脚本相对路径，如 "fib.ts"' } },
        required: ['filename'],
      },
    },
  },
];

const toolMap: Record<string, (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult> = {
  read_file: (args) => readFile(args as { filename?: string }),
  write_file: (args) => writeFile(args as { filename?: string; content?: string }),
  list_dir: (args) => listDir(args as { dirname?: string }),
  run_script: (args) => runScript(args as { filename?: string }),
};

// ═══════════════════════════════════════════════
// 上下文截断（Step 5）
// ═══════════════════════════════════════════════

const TOKEN_THRESHOLD = 6000;
const KEEP_RECENT = 12;

function estimateTokens(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): number {
  return Math.ceil(JSON.stringify(messages).length / 4);
}

function truncateMessages(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  keepRecent: number = KEEP_RECENT,
): { truncated: boolean; dropped: number; savedTokens: number } {
  const beforeTokens = estimateTokens(messages);
  const systemMsgs = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');

  if (nonSystem.length <= keepRecent) return { truncated: false, dropped: 0, savedTokens: 0 };

  const kept = nonSystem.slice(-keepRecent);
  const knownToolCallIds = new Set<string>();
  for (const m of kept) {
    if (m.role === 'assistant' && m.tool_calls) {
      for (const tc of m.tool_calls) if (tc.id) knownToolCallIds.add(tc.id);
    }
  }
  const cleaned = kept.filter((m) => {
    if (m.role === 'tool') {
      const toolMsg = m as OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
      return !(toolMsg.tool_call_id && !knownToolCallIds.has(toolMsg.tool_call_id));
    }
    return true;
  });

  const dropped = nonSystem.length - kept.length;
  messages.length = 0;
  messages.push(...systemMsgs, ...cleaned);
  return { truncated: true, dropped, savedTokens: beforeTokens - estimateTokens(messages) };
}

// ═══════════════════════════════════════════════
// ReAct System Prompt
// ═══════════════════════════════════════════════

const SYSTEM_PROMPT = `你是一个自主编码 Agent，可以在工作目录内创建文件、执行脚本、观察结果并修复错误。

【工作方式：ReAct 模式】
每一步都要先输出 Thought 思考（分析现状、决定下一步、为什么），再决定调用哪个工具。

【可用工具】
- write_file(filename, content): 创建或覆盖文件
- read_file(filename): 读取文件内容
- list_dir(dirname?): 列出目录内容
- run_script(filename): 用 tsx 执行 TS 脚本，返回 stdout/stderr/退出码

【脚本运行环境】
Node.js + tsx，支持标准库（console.log、Math、Array 等），无需 import 即可用。

【行为准则】
1. 先用 write_file 创建脚本，再用 run_script 执行验证。
2. 如果 run_script 返回 stderr 非空或 exitCode 非 0，说明有错误——先 Thought 分析错误原因，再用 write_file 修复，然后重新 run_script。
3. 如果连续 3 次修复仍失败，停下来向用户说明困难，不要无限重试。
4. 脚本运行成功后，用自然语言总结结果（脚本做了什么、输出是什么）。
5. 完成任务后不再调用工具，直接给出最终总结。`;

// ═══════════════════════════════════════════════
// Harness Loop（整合 Step 1 + Step 5）
// ═══════════════════════════════════════════════

const MAX_STEPS = 15;

interface HarnessStats {
  steps: number;
  toolCalls: number;
  fileOps: number;
  scriptRuns: number;
  truncations: number;
}

async function runHarness(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  stats: HarnessStats,
): Promise<void> {
  for (let step = 1; step <= MAX_STEPS; step++) {
    // 上下文截断（惰性触发）
    if (estimateTokens(messages) > TOKEN_THRESHOLD) {
      const result = truncateMessages(messages);
      if (result.truncated) {
        stats.truncations++;
        console.log(`   ✂️ 上下文截断: 丢弃 ${result.dropped} 条，节省约 ${result.savedTokens} tokens`);
      }
    }

    stats.steps = step;
    console.log(`\n── [Step ${step}/${MAX_STEPS}] tokens≈${estimateTokens(messages)} ──`);

    const response = await client.chat.completions.create({ model: MODEL, messages, tools });
    const choice = response.choices[0];
    const toolCalls = choice.message.tool_calls;
    const thought = choice.message.content ?? '';

    if (thought) console.log(`💭 ${thought}`);

    if (!toolCalls || toolCalls.length === 0) {
      console.log(`\n✅ 任务完成`);
      console.log(thought);
      break;
    }

    messages.push(choice.message);

    for (const tc of toolCalls) {
      if (tc.type !== 'function') continue;
      const fn = toolMap[tc.function.name];
      stats.toolCalls++;
      if (tc.function.name === 'write_file' || tc.function.name === 'read_file') stats.fileOps++;
      if (tc.function.name === 'run_script') stats.scriptRuns++;

      let result: ToolResult;
      try {
        const args = JSON.parse(tc.function.arguments);
        const ret = fn ? fn(args) : { ok: false, error: `未知工具: ${tc.function.name}` };
        result = ret instanceof Promise ? await ret : ret;
      } catch (error) {
        result = { ok: false, error: `执行失败: ${error instanceof Error ? error.message : String(error)}` };
      }

      const status = result.ok ? '✅' : '❌';
      // 优先用 data（脚本非零退出时 ok=false 但 data 含 stderr，模型需看到才能修复）
      const content = result.data ?? JSON.stringify({ error: result.error });
      console.log(`   ${status} ${tc.function.name}(${tc.function.arguments})`);
      console.log(`      → ${content.slice(0, 300)}${content.length > 300 ? '...' : ''}`);

      messages.push({
        role: 'tool',
        content,
        tool_call_id: tc.id,
      } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam);
    }

    if (step === MAX_STEPS) console.log(`\n⚠️ 达到最大步数 ${MAX_STEPS}，强制终止`);
  }
}

// ═══════════════════════════════════════════════
// 交互界面
// ═══════════════════════════════════════════════

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const DEFAULT_TASK =
  '在 workspace 下创建 fib.ts，写一个计算斐波那契数列前 10 项并打印的 TypeScript 脚本，然后运行它验证输出正确。如果有错误，修复后重新运行，直到成功。';

function printSummary(stats: HarnessStats) {
  console.log('\n📊 会话摘要');
  console.log(`  执行步数: ${stats.steps}`);
  console.log(`  工具调用: ${stats.toolCalls} 次`);
  console.log(`  文件操作: ${stats.fileOps} 次`);
  console.log(`  脚本执行: ${stats.scriptRuns} 次`);
  console.log(`  上下文截断: ${stats.truncations} 次`);
  console.log('👋 再见！');
}

async function gracefulExit(stats: HarnessStats) {
  printSummary(stats);
  rl.close();
  process.exit(0);
}

// ═══════════════════════════════════════════════
// 主循环
// ═══════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(`🤖 极简自主编码 Agent (${PROVIDER_NAME})`);
  console.log('   能力: 写文件 📝 | 读文件 📄 | 列目录 📂 | 执行脚本 ⚡');
  console.log(`   工作目录: ${WORKSPACE_DIR}`);
  console.log(`   模式: ReAct（先思考再行动）| 最大步数: ${MAX_STEPS}`);
  console.log('   指令: /exit 退出 | /default 运行默认任务 | 直接输入自定义任务');
  console.log('═══════════════════════════════════════════\n');

  const stats: HarnessStats = { steps: 0, toolCalls: 0, fileOps: 0, scriptRuns: 0, truncations: 0 };
  process.on('SIGINT', () => gracefulExit(stats));

  while (true) {
    const input = await rl.question('You: ');
    const trimmed = input.trim();

    if (!trimmed) continue;
    if (trimmed === '/exit') {
      await gracefulExit(stats);
      return;
    }

    const task = trimmed === '/default' ? DEFAULT_TASK : trimmed;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: task },
    ];

    console.log(`\n任务: ${task}`);
    try {
      await runHarness(messages, stats);
      console.log(`\n📊 [累计] 步数 ${stats.steps} | 工具 ${stats.toolCalls} | 文件 ${stats.fileOps} | 脚本 ${stats.scriptRuns} | 截断 ${stats.truncations}\n`);
    } catch (error) {
      console.error('❌ 任务执行失败:', error);
    }
  }
}

main().catch(console.error);

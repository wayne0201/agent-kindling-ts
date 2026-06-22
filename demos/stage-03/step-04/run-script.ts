/**
 * Stage 3 · Step 4: 脚本执行工具
 * 目标：实现 run_script 工具，让 Agent 能执行本地 TS 脚本并捕获输出。
 *       配合 write_file，Agent 可完成"写代码 → 跑代码 → 看结果"闭环。
 *
 * 工程要点：
 *   - 用 execFile（非 exec）执行 tsx，参数以数组传递，杜绝 shell 注入。
 *   - timeout：超时 SIGTERM 杀进程，回调里区分"超时被杀"与"正常退出码非零"。
 *   - 输出截断：stdout/stderr 超 MAX_OUTPUT_CHARS 截断，防止撑爆上下文。
 *   - stdout 与 stderr 分别标注回传，让模型能区分正常输出与报错。
 */
import OpenAI from 'openai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { API_KEY, BASE_URL, MODEL, PROVIDER_NAME } from '../../common/config.js';

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

// ── 工作目录 ──

const WORKSPACE_DIR = path.resolve(import.meta.dirname, '../workspace');
fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

// ── 安全路径解析 ──

type ToolResult = { ok: boolean; data?: string; error?: string };

function resolveSafePath(filename: string): { ok: true; absPath: string } | { ok: false; error: string } {
  if (!filename) return { ok: false, error: '缺少文件名参数' };
  const absPath = path.resolve(WORKSPACE_DIR, filename);
  if (!absPath.startsWith(WORKSPACE_DIR + path.sep) && absPath !== WORKSPACE_DIR) {
    return { ok: false, error: `路径越界："${filename}" 不在工作目录内` };
  }
  return { ok: true, absPath };
}

// ── 文件工具（精简版，仅供本步写脚本用） ──

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

// ── 脚本执行工具 ──

const SCRIPT_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_CHARS = 2000;

/** 截断过长输出，附加截断提示 */
function truncateOutput(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_OUTPUT_CHARS) return { text, truncated: false };
  return {
    text: text.slice(0, MAX_OUTPUT_CHARS) + `\n... [输出已截断，共 ${text.length} 字符]`,
    truncated: true,
  };
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
    // 用 tsx 执行 TS 脚本；execFile 不走 shell，参数数组传递，防注入
    execFile(
      'npx',
      ['tsx', resolved.absPath],
      { timeout: SCRIPT_TIMEOUT_MS, maxBuffer: 1024 * 1024, cwd: WORKSPACE_DIR },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - startTime;
        const out = truncateOutput(stdout.toString());
        const err = truncateOutput(stderr.toString());

        // 区分超时被杀 vs 正常退出码非零
        const timedOut = !!error && (error as NodeJS.ErrnoException & { signal?: string }).signal === 'SIGTERM';
        const exitCode = error ? (error as NodeJS.ErrnoException).code ?? -1 : 0;

        if (timedOut) {
          resolve({
            ok: false,
            error: `脚本执行超时（${SCRIPT_TIMEOUT_MS}ms），已终止。退出码: ${exitCode}`,
          });
          return;
        }

        // 正常退出（exitCode 0）视为成功；非零退出码仍把输出回传，让模型看 stderr 修正
        // 注意：ok=false 但 data 有值时，harness 须优先用 data（见下方 content 处理）
        const data = JSON.stringify({
          exitCode,
          durationMs,
          stdout: out.text,
          stderr: err.text,
          truncated: out.truncated || err.truncated,
        });

        resolve({ ok: exitCode === 0, data });
      },
    );
  });
}

// ── 工具定义与映射 ──

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '在工作目录下创建或覆盖文件。filename 为相对路径，content 为写入的文本内容。',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: '相对于工作目录的文件路径，如 "demo.ts"' },
          content: { type: 'string', description: '要写入的文本内容' },
        },
        required: ['filename', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取工作目录下的文件内容。',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: '相对于工作目录的文件路径' },
        },
        required: ['filename'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_script',
      description: '用 tsx 执行工作目录下的 TypeScript/JavaScript 脚本，返回 stdout、stderr、退出码和耗时。脚本需先通过 write_file 创建。',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: '要执行的脚本文件相对路径，如 "demo.ts"' },
        },
        required: ['filename'],
      },
    },
  },
];

const toolMap: Record<string, (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult> = {
  write_file: (args) => writeFile(args as { filename?: string; content?: string }),
  read_file: (args) => readFile(args as { filename?: string }),
  run_script: (args) => runScript(args as { filename?: string }),
};

// ── Harness Loop ──

const MAX_STEPS = 10;

async function runHarness(task: string): Promise<void> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `你是一个编码助手，可以创建文件和执行 TypeScript 脚本。
工作方式（ReAct）：先输出 Thought 思考，再决定调用哪个工具。
可用工具：write_file / read_file / run_script。
脚本运行环境：Node.js + tsx，支持标准库（如 console.log、Math 等）。
完成任务后，用自然语言总结结果。`,
    },
    { role: 'user', content: task },
  ];

  for (let step = 1; step <= MAX_STEPS; step++) {
    console.log(`\n── [Step ${step}/${MAX_STEPS}] ──`);

    const response = await client.chat.completions.create({ model: MODEL, messages, tools });
    const choice = response.choices[0];
    const toolCalls = choice.message.tool_calls;
    const thought = choice.message.content ?? '';

    if (thought) console.log(`💭 ${thought}`);

    if (!toolCalls || toolCalls.length === 0) {
      console.log(`\n✅ 最终回复:\n${thought}`);
      break;
    }

    messages.push(choice.message);

    for (const tc of toolCalls) {
      if (tc.type !== 'function') continue;
      const fn = toolMap[tc.function.name];

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

    if (step === MAX_STEPS) console.log(`⚠️ 达到最大步数，强制终止`);
  }
}

// ── 主流程 ──

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(`⚡ 脚本执行工具 (${PROVIDER_NAME})`);
  console.log(`   工作目录: ${WORKSPACE_DIR}`);
  console.log(`   超时: ${SCRIPT_TIMEOUT_MS}ms | 输出截断: ${MAX_OUTPUT_CHARS} 字符`);
  console.log('═══════════════════════════════════════════');

  // 任务：写一个有 bug 的脚本 → 执行 → 看报错 → 修复 → 再执行
  const task =
    '请在工作目录创建一个 sum.ts 脚本，计算 1 到 100 的和并打印结果。然后运行它验证输出。如果运行报错，请修复后重新运行，直到成功。';

  console.log(`\n用户任务: ${task}`);
  console.log(`（Agent 需自主完成 写 → 跑 → 看报错 → 修 → 再跑 的闭环）`);

  await runHarness(task);

  console.log('\n═══════════════════════════════════════════');
  console.log('✅ 脚本执行实验完成');
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);

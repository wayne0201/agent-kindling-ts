/**
 * Stage 3 · Step 3: 文件操作工具集
 * 目标：从"模拟工具"跃迁到"真实副作用工具"。实现 read_file / write_file / list_dir，
 *       让 Agent 能真正读写本地文件系统。把工作目录限制在 workspace/ 内，防止路径越界。
 *
 * ⚠️ 关于"工作目录"安全性的澄清：
 *   本步实现的只是"路径限制（path restriction）"，不是真正意义的沙箱。
 *   代码与宿主运行在同一个 Node 进程，继承宿主用户的全部文件系统权限。
 *   这里的防护仅针对 ../ 路径穿越，符号链接、TOCTOU 竞态等均可绕过。
 *   真正的进程级沙箱（容器隔离、降权运行）是 Stage 11 的主题。
 *
 * 路径校验三道防线：
 *   ① path.resolve 规范化路径
 *   ② 检查结果路径是否以工作目录开头（startsWith）
 *   ③ 越界返回错误而非抛异常（让 Agent 自行修正）
 *
 * 工具错误统一以 role:"tool" 回传，不中断 Harness Loop（复用 Stage 2 Step 3 模式）。
 */
import OpenAI from 'openai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { API_KEY, BASE_URL, MODEL, PROVIDER_NAME } from '../../common/config.js';

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL,
});

// ── 工作目录（path restriction，非进程级沙箱） ──

const WORKSPACE_DIR = path.resolve(import.meta.dirname, '../workspace');

// 启动时确保工作目录存在
fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

// ── 安全路径解析 ──

type ToolResult = { ok: boolean; data?: string; error?: string };

/**
 * 将 Agent 给出的相对路径解析为工作目录内绝对路径，越界返回错误。
 * 注意：这是路径前缀校验，只挡 ../ 穿越，不防符号链接/竞态——非真正沙箱。
 */
function resolveSafePath(filename: string): { ok: true; absPath: string } | { ok: false; error: string } {
  if (!filename) return { ok: false, error: '缺少文件名参数' };
  const absPath = path.resolve(WORKSPACE_DIR, filename);
  if (!absPath.startsWith(WORKSPACE_DIR + path.sep) && absPath !== WORKSPACE_DIR) {
    return { ok: false, error: `路径越界："${filename}" 不在工作目录内` };
  }
  return { ok: true, absPath };
}

// ── 工具实现 ──

function readFile(args: { filename?: string }): ToolResult {
  const resolved = resolveSafePath(args.filename ?? '');
  if (!resolved.ok) return { ok: false, error: resolved.error };

  try {
    if (!fs.existsSync(resolved.absPath)) {
      return { ok: false, error: `文件不存在: ${args.filename}` };
    }
    const content = fs.readFileSync(resolved.absPath, 'utf-8');
    return { ok: true, data: content };
  } catch (error) {
    return { ok: false, error: `读取失败: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function writeFile(args: { filename?: string; content?: string }): ToolResult {
  const resolved = resolveSafePath(args.filename ?? '');
  if (!resolved.ok) return { ok: false, error: resolved.error };
  if (args.content === undefined) return { ok: false, error: '缺少 content 参数' };

  try {
    // 确保父目录存在
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
    if (!fs.existsSync(resolved.absPath)) {
      return { ok: false, error: `目录不存在: ${target}` };
    }
    const entries = fs.readdirSync(resolved.absPath, { withFileTypes: true });
    const listing = entries.map((e) => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`);
    return { ok: true, data: listing.length ? listing.join('\n') : '(空目录)' };
  } catch (error) {
    return { ok: false, error: `列目录失败: ${error instanceof Error ? error.message : String(error)}` };
  }
}

// ── 工具定义与映射 ──

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取工作目录下的文件内容。filename 为相对路径，如 "hello.txt" 或 "sub/note.md"。',
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
      name: 'write_file',
      description: '在工作目录下创建或覆盖文件。filename 为相对路径，content 为写入的文本内容。',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: '相对于工作目录的文件路径' },
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
      description: '列出工作目录（或其子目录）下的文件和子目录。dirname 为相对路径，默认为工作目录根。',
      parameters: {
        type: 'object',
        properties: {
          dirname: { type: 'string', description: '相对于工作目录的目录路径，默认为根目录' },
        },
      },
    },
  },
];

const toolMap: Record<string, (args: Record<string, unknown>) => ToolResult> = {
  read_file: (args) => readFile(args as { filename?: string }),
  write_file: (args) => writeFile(args as { filename?: string; content?: string }),
  list_dir: (args) => listDir(args as { dirname?: string }),
};

// ── Harness Loop ──

const MAX_STEPS = 10;

async function runHarness(task: string): Promise<void> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `你是一个文件操作助手，可以在工作目录内读写文件。
工作方式（ReAct）：先输出 Thought 思考，再决定调用哪个工具。
可用工具：read_file / write_file / list_dir。所有路径都是相对于工作目录的相对路径。
完成任务后，用自然语言总结你做了什么。`,
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
      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = JSON.parse(tc.function.arguments);
        result = fn ? fn(parsedArgs) : { ok: false, error: `未知工具: ${tc.function.name}` };
      } catch (error) {
        parsedArgs = {};
        result = { ok: false, error: `参数解析失败: ${error instanceof Error ? error.message : String(error)}` };
      }

      const status = result.ok ? '✅' : '❌';
      const content = result.ok ? result.data! : JSON.stringify({ error: result.error });
      console.log(`   ${status} ${tc.function.name}(${tc.function.arguments})`);
      console.log(`      → ${content.slice(0, 200)}${content.length > 200 ? '...' : ''}`);

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
  console.log(`📁 文件操作工具集 (${PROVIDER_NAME})`);
  console.log(`   工作目录: ${WORKSPACE_DIR}`);
  console.log('═══════════════════════════════════════════');

  const task =
    '请帮我完成以下操作：1) 创建一个文件 hello.txt，内容写入"你好，Agent！"；2) 再读取这个文件确认内容；3) 最后列出工作目录下有哪些文件。完成后总结你做了什么。';

  console.log(`\n用户任务: ${task}`);

  await runHarness(task);

  // 验证真实副作用：检查文件是否真的被创建
  console.log('\n═══════════════════════════════════════════');
  console.log('🔍 验证真实副作用（检查磁盘）:');
  const helloPath = path.resolve(WORKSPACE_DIR, 'hello.txt');
  if (fs.existsSync(helloPath)) {
    console.log(`   ✅ hello.txt 已创建，内容: "${fs.readFileSync(helloPath, 'utf-8')}"`);
  } else {
    console.log(`   ❌ hello.txt 未创建（Agent 可能未完成任务）`);
  }
  console.log(`   📂 workspace 目录内容: ${fs.readdirSync(WORKSPACE_DIR).join(', ') || '(空)'}`);
  console.log('═══════════════════════════════════════════');
}

main().catch(console.error);

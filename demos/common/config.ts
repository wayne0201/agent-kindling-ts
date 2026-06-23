/**
 * 统一 LLM 配置模块
 * 通过 LLM_PROVIDER 环境变量切换 Chat 模型提供商，业务代码无需感知具体厂商。
 *
 * Chat 与 Embedding 完全解耦：
 *   - LLM_PROVIDER（glm | deepseek）控制 Chat 模型
 *   - EMBEDDING_API_KEY / EMBEDDING_BASE_URL / EMBEDDING_MODEL 独立控制 Embedding 服务
 *   两者互不影响，可以实现任意组合（如 Chat 用 DeepSeek + Embedding 用智谱 GLM）。
 *
 * 用法：
 *   import { API_KEY, BASE_URL, MODEL } from '../../common/config.js';
 *   const chatClient = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
 *
 *   import { EMBEDDING_API_KEY, EMBEDDING_BASE_URL, EMBEDDING_MODEL } from '../../common/config.js';
 *   const embedClient = new OpenAI({ apiKey: EMBEDDING_API_KEY, baseURL: EMBEDDING_BASE_URL });
 */
import dotenv from 'dotenv';

dotenv.config();

type Provider = 'glm' | 'deepseek';

interface ProviderConfig {
  apiKeyEnv: string;
  baseUrlEnv: string;
  modelEnv: string;
  defaultModel: string;
  name: string;
}

const PROVIDER_CONFIG: Record<Provider, ProviderConfig> = {
  glm: {
    apiKeyEnv: 'ZHIPU_API_KEY',
    baseUrlEnv: 'ZHIPU_BASE_URL',
    modelEnv: 'ZHIPU_MODEL',
    defaultModel: 'glm-4.5-air',
    name: '智谱 GLM',
  },
  deepseek: {
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseUrlEnv: 'DEEPSEEK_BASE_URL',
    modelEnv: 'DEEPSEEK_MODEL',
    defaultModel: 'deepseek-v4-flash',
    name: 'DeepSeek',
  },
};

// ── 工具函数 ──

function getProvider(): Provider {
  const provider = process.env.LLM_PROVIDER as Provider;
  if (!provider || !(provider in PROVIDER_CONFIG)) {
    console.error(`❌ 致命错误：LLM_PROVIDER 未设置或无效（当前值: "${provider}"）`);
    console.error(`可选值: ${Object.keys(PROVIDER_CONFIG).join(' | ')}`);
    process.exit(1);
  }
  return provider;
}

function getEnvOrExit(key: string): string {
  const value = process.env[key];
  if (!value || value.startsWith('your_')) {
    console.error(`❌ 致命错误：环境变量 ${key} 未设置或仍为占位符`);
    console.error('请复制 .env.example 为 .env 并填入真实值。');
    process.exit(1);
  }
  return value;
}

// ── Chat 配置（由 LLM_PROVIDER 控制）──

const provider = getProvider();
const config = PROVIDER_CONFIG[provider];

export const API_KEY = getEnvOrExit(config.apiKeyEnv);
export const BASE_URL = getEnvOrExit(config.baseUrlEnv);
export const MODEL = process.env[config.modelEnv] || config.defaultModel;
export const PROVIDER_NAME = config.name;

// ── Embedding 配置（独立于 Chat，三件套直接读环境变量）──
// 不绑定任何 Provider，可以使用任意 OpenAI 兼容的 Embedding 服务。
// 推荐：智谱 GLM embedding-3（2048 维）、SiliconFlow bge-m3（免费）等。

export const EMBEDDING_API_KEY: string = process.env.EMBEDDING_API_KEY || '';
export const EMBEDDING_BASE_URL: string = process.env.EMBEDDING_BASE_URL || '';
export const EMBEDDING_MODEL: string = process.env.EMBEDDING_MODEL || '';

/**
 * 校验 Embedding 配置是否可用。
 * Stage 4+ 的脚本在入口处调用此函数，确保启动时就能发现问题，而不是运行到 API 调用才报错。
 */
export function validateEmbeddingConfig(): void {
  const missing: string[] = [];
  if (!EMBEDDING_API_KEY || EMBEDDING_API_KEY.startsWith('your_')) missing.push('EMBEDDING_API_KEY');
  if (!EMBEDDING_BASE_URL) missing.push('EMBEDDING_BASE_URL');
  if (!EMBEDDING_MODEL) missing.push('EMBEDDING_MODEL');

  if (missing.length > 0) {
    console.error('═══════════════════════════════════════════════════════');
    console.error('❌ 致命错误：Embedding 配置不完整');
    console.error(`   缺少: ${missing.join(', ')}`);
    console.error('');
    console.error('   Stage 4+ 需要 Embedding 服务将文本向量化（RAG 的地基）。');
    console.error('   请在 .env 文件中配置以下三个变量：');
    console.error('');
    console.error('   EMBEDDING_API_KEY="你的 API Key"');
    console.error('   EMBEDDING_BASE_URL="Embedding 服务的 API 地址"');
    console.error('   EMBEDDING_MODEL="Embedding 模型名称"');
    console.error('');
    console.error('   推荐方案（任选其一）：');
    console.error('   ┌─────────────────────────────────────────────────────────────┐');
    console.error('   │ 方案 A：智谱 GLM embedding-3（2048 维，本项目推荐）         │');
    console.error('   │   EMBEDDING_API_KEY="你的智谱 API Key"                      │');
    console.error('   │   EMBEDDING_BASE_URL="https://open.bigmodel.cn/api/paas/v4" │');
    console.error('   │   EMBEDDING_MODEL="embedding-3"                            │');
    console.error('   ├─────────────────────────────────────────────────────────────┤');
    console.error('   │ 方案 B：SiliconFlow bge-m3（免费，OpenAI 兼容）             │');
    console.error('   │   EMBEDDING_API_KEY="你的 SiliconFlow API Key"             │');
    console.error('   │   EMBEDDING_BASE_URL="https://api.siliconflow.cn/v1"       │');
    console.error('   │   EMBEDDING_MODEL="BAAI/bge-m3"                            │');
    console.error('   └─────────────────────────────────────────────────────────────┘');
    console.error('');
    console.error('   ⚠️  注意：DeepSeek 官方 API 不提供 Embedding 服务，');
    console.error('      不能用 DeepSeek 的 Key 调用 Embedding 接口。');
    console.error('═══════════════════════════════════════════════════════');
    process.exit(1);
  }
}

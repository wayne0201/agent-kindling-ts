/**
 * 统一 LLM 配置模块
 * 通过 LLM_PROVIDER 环境变量切换模型提供商，业务代码无需感知具体厂商。
 *
 * 用法：
 *   import { API_KEY, BASE_URL, MODEL } from '../src/config.js';
 *   const client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
 */
import dotenv from 'dotenv';

dotenv.config();

type Provider = 'glm' | 'deepseek';

const PROVIDER_CONFIG: Record<
  Provider,
  { apiKeyEnv: string; baseUrlEnv: string; modelEnv: string; defaultModel: string; name: string }
> = {
  glm: {
    apiKeyEnv: 'ZHIPU_API_KEY',
    baseUrlEnv: 'ZHIPU_BASE_URL',
    modelEnv: 'ZHIPU_MODEL',
    defaultModel: 'glm-4.6',
    name: '智谱 GLM',
  },
  deepseek: {
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseUrlEnv: 'DEEPSEEK_BASE_URL',
    modelEnv: 'DEEPSEEK_MODEL',
    defaultModel: 'deepseek-chat',
    name: 'DeepSeek',
  },
};

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

const provider = getProvider();
const config = PROVIDER_CONFIG[provider];

export const API_KEY = getEnvOrExit(config.apiKeyEnv);
export const BASE_URL = getEnvOrExit(config.baseUrlEnv);
export const MODEL = process.env[config.modelEnv] || config.defaultModel;
export const PROVIDER_NAME = config.name;

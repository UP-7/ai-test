/**
 * work-reporter 配置
 * 从 .env.local 读取环境变量，支持 DeepSeek / OpenAI 兼容 API
 */
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

// 手动解析 .env.local（不依赖 dotenv 包）
function loadEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const content = readFileSync(filePath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // 去掉引号
    if ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

// 项目根目录
export const PROJECT_ROOT = resolve(__dirname, '../..');

// 加载环境变量
const envFile = resolve(PROJECT_ROOT, '.env.local');
const envVars = loadEnvFile(envFile);

// 导出配置
export const config = {
  /** DeepSeek / OpenAI 兼容 API Key */
  apiKey: process.env.LLM_API_KEY || envVars.LLM_API_KEY || '',
  /** API Base URL */
  baseUrl: process.env.LLM_BASE_URL || envVars.LLM_BASE_URL || 'https://api.deepseek.com',
  /** 模型名称（deepseek-reasoner 即 R1，深度推理能力更强，适合代码分析） */
  model: process.env.LLM_MODEL || envVars.LLM_MODEL || 'deepseek-reasoner',
  /** 输出目录 */
  outputDir: resolve(PROJECT_ROOT, 'work-reports'),
  /** 知识库文件 */
  knowledgeFile: resolve(PROJECT_ROOT, '.requirement-knowledge.md'),
};

// 校验
export function validateConfig(): void {
  if (!config.apiKey) {
    console.error('❌ 缺少 LLM_API_KEY，请在 .env.local 中配置');
    process.exit(1);
  }
}

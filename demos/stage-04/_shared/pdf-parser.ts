/**
 * Stage 4 共享模块：文档解析与文本清洗
 *
 * 支持 .pdf / .txt / .md 三种格式。
 * PDF 解析依赖 pdf-parse（动态导入，未安装时给出清晰提示）。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 解析 PDF 文件，返回提取的纯文本。
 * pdf-parse 通过动态 import 加载，未安装时给出清晰提示。
 */
export async function parsePdf(filePath: string): Promise<string> {
  const mod = await import('pdf-parse').catch(() => {
    throw new Error(
      'pdf-parse 未安装，无法解析 PDF。请运行 `pnpm add pdf-parse`，或改用 .txt/.md 文件。',
    );
  });
  const pdfParse = mod.default ?? mod;
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

/** 读取纯文本文件（.txt / .md） */
export function parseTextFile(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * 文本清洗：PDF 提取的文本常带大量多余空白、换行、页眉页脚碎片。
 * 清洗策略：统一换行 → 折叠连续空行 → 压缩连续空格 → 去首尾空白。
 */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n') // 统一换行符
    .replace(/\n{3,}/g, '\n\n') // 连续 3+ 换行折叠为 2 个（保留段落分隔）
    .replace(/[ \t]+/g, ' ') // 连续空格/Tab 压缩为 1 个
    .replace(/ +\n/g, '\n') // 行尾空格
    .trim();
}

/**
 * 统一文档解析入口：根据扩展名分发，返回清洗后的文本。
 */
export async function parseDocument(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  let raw: string;
  if (ext === '.pdf') {
    raw = await parsePdf(filePath);
  } else if (ext === '.txt' || ext === '.md') {
    raw = parseTextFile(filePath);
  } else {
    throw new Error(`不支持的文件格式: ${ext}（支持 .pdf / .txt / .md）`);
  }
  return cleanText(raw);
}

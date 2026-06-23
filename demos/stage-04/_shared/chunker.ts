/**
 * Stage 4 共享模块：文本分块（Chunking）
 *
 * 为什么需要分块？
 *   1. Embedding 模型有输入长度上限（embedding-3 约 8K tokens）；
 *   2. 检索粒度——整篇文档一个向量太粗，按句又太细，段落级 chunk 是甜点区；
 *   3. 生成阶段拼入 Prompt 的上下文也要受 token 预算约束。
 *
 * 本模块实现最基础的"固定长度 + 重叠窗口"策略。
 * 更高级的分块（按语义边界、递归分块）留给 Stage 5。
 */

export interface Chunk {
  id: number;
  text: string;
  start: number;
  end: number;
}

/**
 * 将长文本切分为固定长度的 chunk，相邻 chunk 之间有 overlap 重叠。
 *
 * @param text       原始文本
 * @param chunkSize  每个 chunk 的字符数
 * @param overlap    相邻 chunk 的重叠字符数（防止语义在边界被硬切断）
 */
export function splitText(text: string, chunkSize = 500, overlap = 50): Chunk[] {
  if (chunkSize <= 0) throw new Error('chunkSize 必须大于 0');
  if (overlap < 0 || overlap >= chunkSize) throw new Error('overlap 必须在 [0, chunkSize) 范围内');

  const cleaned = text.replace(/\r\n/g, '\n');
  const chunks: Chunk[] = [];
  let start = 0;
  let id = 0;

  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push({ id: id++, text: cleaned.slice(start, end), start, end });
    if (end >= cleaned.length) break;
    start = end - overlap; // 回退 overlap 个字符，形成重叠窗口
  }

  return chunks;
}

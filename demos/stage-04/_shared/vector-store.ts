/**
 * Stage 4 共享模块：手写向量库（VectorStore）
 *
 * 不依赖任何向量数据库，用 JSON 文件持久化，内存中做余弦相似度检索。
 * 这是"手撕 RAG 内核"的体现——先理解原理，Stage 5+ 再引入更高效的索引。
 *
 * 能力：
 *   - addTexts(texts, source): 批量向量化并入库
 *   - search(query, topK):     语义检索 topK 结果
 *   - save(path) / load(path): JSON 持久化，跨进程复用
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getEmbedding, getEmbeddings, cosineSimilarity } from './embedding.js';

export interface VectorRecord {
  id: string;
  text: string;
  embedding: number[];
  metadata: {
    source: string; // 来源文件名
    chunkIndex: number; // 在来源中的分块序号
  };
}

export interface SearchResult {
  record: VectorRecord;
  score: number; // 余弦相似度 [−1, 1]
}

export class VectorStore {
  private records: VectorRecord[] = [];

  /** 当前库中的记录数 */
  size(): number {
    return this.records.length;
  }

  /** 清空所有记录 */
  clear(): void {
    this.records = [];
  }

  /** 列出已索引的来源文件（去重） */
  listSources(): string[] {
    return [...new Set(this.records.map((r) => r.metadata.source))];
  }

  /**
   * 批量向量化并入库。
   * @param texts  分块后的文本数组
   * @param source 来源标识（文件名）
   */
  async addTexts(texts: string[], source: string): Promise<void> {
    if (texts.length === 0) return;
    const embeddings = await getEmbeddings(texts);
    const baseIndex = this.records.length;
    texts.forEach((text, i) => {
      this.records.push({
        id: `${source}#${baseIndex + i}`,
        text,
        embedding: embeddings[i],
        metadata: { source, chunkIndex: i },
      });
    });
  }

  /**
   * 语义检索：把 query 向量化，与所有记录算余弦相似度，返回 topK。
   * 线性扫描——O(N×D)，数据量大时应换 ANN 索引（Stage 5+ 主题）。
   */
  async search(query: string, topK = 3): Promise<SearchResult[]> {
    if (this.records.length === 0) return [];
    const queryEmbedding = await getEmbedding(query);
    const scored = this.records.map((record) => ({
      record,
      score: cosineSimilarity(queryEmbedding, record.embedding),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /** 持久化到 JSON 文件 */
  save(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(this.records, null, 2), 'utf-8');
  }

  /** 从 JSON 文件加载 */
  load(filePath: string): void {
    if (!fs.existsSync(filePath)) return;
    this.records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
}

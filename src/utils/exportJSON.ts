import type { Segment } from '../types';

/** 生成完整 JSON 导出（保留所有字段，方便以后导入继续编辑） */
export function exportJSON(segments: Segment[]): string {
  return JSON.stringify(segments, null, 2);
}

import type { Segment } from '../types';

/** 生成纯文本格式，跳过 status === 'delete' 的字幕 */
export function exportTXT(segments: Segment[], includeTimecode = false): string {
  const lines: string[] = [];

  for (const seg of segments) {
    if (seg.status === 'delete') continue;
    const lineText = seg.speaker ? `${seg.speaker}: ${seg.edited_text}` : seg.edited_text;
    if (includeTimecode) {
      const m = Math.floor(seg.start / 60);
      const s = Math.floor(seg.start % 60);
      const time = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      lines.push(`[${time}] ${lineText}`);
    } else {
      lines.push(lineText);
    }
  }

  return lines.join('\n');
}

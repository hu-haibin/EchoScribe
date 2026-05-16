import type { Segment } from '../types';

/** 将秒数格式化为 SRT 时间码: HH:MM:SS,mmm */
function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/** 生成 SRT 格式字符串，跳过 status === 'delete' 的字幕 */
export function exportSRT(segments: Segment[]): string {
  let index = 1;
  const lines: string[] = [];

  for (const seg of segments) {
    if (seg.status === 'delete') continue;
    lines.push(String(index));
    lines.push(`${formatSRTTime(seg.start)} --> ${formatSRTTime(seg.end)}`);
    lines.push(seg.speaker ? `${seg.speaker}: ${seg.edited_text}` : seg.edited_text);
    lines.push('');
    index++;
  }

  return lines.join('\n');
}

/** 触发浏览器下载 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

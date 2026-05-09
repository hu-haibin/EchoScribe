/** 字幕状态 */
export type SegmentStatus = 'review' | 'keep' | 'delete';

/** 单条字幕 */
export interface Segment {
  id: string;
  start: number;       // 秒
  end: number;         // 秒
  raw_text: string;    // AI 原始识别
  edited_text: string; // 用户修改后
  status: SegmentStatus;
  important: boolean;  // 重点标签
  needsCheck: boolean; // 待确认标签
}

/** 任务状态 */
export type JobState = 'pending' | 'transcribing' | 'done' | 'error';

/** 单个任务 */
export interface Job {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl: string;     // createObjectURL 的 URL
  state: JobState;
  progress: number;    // 0-100
}

/** 倍速选项 */
export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
export type PlaybackRate = typeof PLAYBACK_RATES[number];

/** Mock 数据档位 */
export const MOCK_SIZES = [50, 500, 5000] as const;
export type MockSize = typeof MOCK_SIZES[number];

export type SegmentStatus = 'review' | 'keep' | 'delete';

export interface Segment {
  id: string;
  start: number;
  end: number;
  raw_text: string;
  edited_text: string;
  speaker?: string;
  status: SegmentStatus;
  important: boolean;
  needsCheck: boolean;
}

export type JobState = 'pending' | 'transcribing' | 'done' | 'error';

export interface Job {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  mediaAvailable: boolean;
  state: JobState;
  progress: number;
  asrProvider?: string;
  asrModel?: string;
  asrAligner?: string;
  durationSeconds?: number;
  progressMessage?: string;
  errorMessage?: string;
  warnings?: string[];
}

export const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2] as const;
export type PlaybackRate = typeof PLAYBACK_RATES[number];

export const MOCK_SIZES = [50, 500, 5000] as const;
export type MockSize = typeof MOCK_SIZES[number];

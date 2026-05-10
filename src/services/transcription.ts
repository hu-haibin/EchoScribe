import type { Segment } from '../types';

export const LOCAL_ASR_PROVIDER = 'local-qwen3-asr';
export const DEFAULT_ASR_MODEL = 'Qwen/Qwen3-ASR-1.7B';
export const DEFAULT_ASR_ALIGNER = 'Qwen/Qwen3-ForcedAligner-0.6B';

export interface TranscriptionResponse {
  provider: string;
  model: string;
  aligner: string;
  segments: Segment[];
  fullText: string;
  durationSeconds: number;
  warnings: string[];
}

function normalizeSegment(segment: Partial<Segment>, index: number): Segment {
  const start = Number(segment.start);
  const end = Number(segment.end);
  const text = String(segment.edited_text ?? segment.raw_text ?? '').trim();

  return {
    id: segment.id || `seg_${String(index + 1).padStart(4, '0')}`,
    start: Number.isFinite(start) ? start : 0,
    end: Number.isFinite(end) && end > start ? end : start + 2,
    raw_text: String(segment.raw_text ?? text),
    edited_text: text || String(segment.raw_text ?? ''),
    status: segment.status === 'keep' || segment.status === 'delete' ? segment.status : 'review',
    important: Boolean(segment.important),
    needsCheck: Boolean(segment.needsCheck),
  };
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const detail = 'detail' in payload ? (payload as { detail?: unknown }).detail : undefined;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object' && 'message' in detail) {
      const message = (detail as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
    if ('message' in payload) {
      const message = (payload as { message?: unknown }).message;
      if (typeof message === 'string') return message;
    }
  }
  return fallback;
}

export async function transcribeMedia(file: File): Promise<TranscriptionResponse> {
  const body = new FormData();
  body.append('file', file);

  let response: Response;
  try {
    response = await fetch('/api/transcribe', {
      method: 'POST',
      body,
    });
  } catch {
    throw new Error('本地识别服务未启动，请先启动 local-asr 服务');
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if ((response.status === 502 || response.status === 504 || response.status === 500) && payload === null) {
      throw new Error('本地识别服务未启动，请先启动 local-asr 服务');
    }
    throw new Error(getErrorMessage(payload, `本地识别失败：HTTP ${response.status}`));
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('本地识别返回格式异常');
  }

  const data = payload as Partial<TranscriptionResponse>;
  const segments = Array.isArray(data.segments)
    ? data.segments.map((segment, index) => normalizeSegment(segment, index))
    : [];

  if (segments.length === 0) {
    throw new Error('本地识别没有返回可复核的字幕');
  }

  return {
    provider: data.provider || LOCAL_ASR_PROVIDER,
    model: data.model || DEFAULT_ASR_MODEL,
    aligner: data.aligner || DEFAULT_ASR_ALIGNER,
    segments,
    fullText: data.fullText || segments.map((segment) => segment.edited_text).join(''),
    durationSeconds: Number(data.durationSeconds) || 0,
    warnings: Array.isArray(data.warnings) ? data.warnings.map(String) : [],
  };
}

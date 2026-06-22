import type { Segment } from '../types';

export const LOCAL_ASR_PROVIDER = 'local-qwen3-asr';
export const CLOUD_ASR_PROVIDER = 'volcengine-doubao-asr';
export const DEFAULT_ASR_MODEL = 'Qwen/Qwen3-ASR-1.7B';
export const DEFAULT_ASR_ALIGNER = 'Qwen/Qwen3-ForcedAligner-0.6B';
export const CLOUD_ASR_MODEL = 'volc.bigasr.auc_turbo';

export type AsrProvider = 'local' | 'cloud';

export type TranscriptionJobStatus = 'queued' | 'transcribing' | 'done' | 'error';

export interface TranscriptionResponse {
  provider: string;
  model: string;
  aligner: string;
  segments: Segment[];
  fullText: string;
  durationSeconds: number;
  warnings: string[];
}

export interface TranscriptionProgress {
  status: TranscriptionJobStatus;
  progress: number;
  message: string;
  currentChunk?: number;
  totalChunks?: number;
}

interface TranscriptionJobPayload extends Partial<TranscriptionProgress> {
  jobId?: string;
  result?: Partial<TranscriptionResponse>;
  errorMessage?: string;
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
    speaker: typeof segment.speaker === 'string' && segment.speaker.trim() ? segment.speaker.trim() : undefined,
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
    if ('errorMessage' in payload) {
      const errorMessage = (payload as { errorMessage?: unknown }).errorMessage;
      if (typeof errorMessage === 'string') return errorMessage;
    }
  }
  return fallback;
}

function normalizeResponse(payload: Partial<TranscriptionResponse>): TranscriptionResponse {
  const segments = Array.isArray(payload.segments)
    ? payload.segments.map((segment, index) => normalizeSegment(segment, index))
    : [];

  if (segments.length === 0) {
    throw new Error('识别服务没有返回可复核的字幕段落。');
  }

  return {
    provider: payload.provider || LOCAL_ASR_PROVIDER,
    model: payload.model || DEFAULT_ASR_MODEL,
    aligner: payload.aligner ?? '',
    segments,
    fullText: payload.fullText || segments.map((segment) => segment.edited_text).join(''),
    durationSeconds: Number(payload.durationSeconds) || 0,
    warnings: Array.isArray(payload.warnings) ? payload.warnings.map(String) : [],
  };
}

function localizeProgressMessage(payload: TranscriptionJobPayload, status: TranscriptionJobStatus): string {
  const raw = typeof payload.message === 'string' ? payload.message.trim() : '';
  const currentChunk =
    typeof payload.currentChunk === 'number' && Number.isFinite(payload.currentChunk)
      ? payload.currentChunk
      : undefined;
  const totalChunks =
    typeof payload.totalChunks === 'number' && Number.isFinite(payload.totalChunks)
      ? payload.totalChunks
      : undefined;
  const chunkLabel =
    currentChunk && totalChunks && totalChunks > 1 ? `第 ${currentChunk}/${totalChunks} 段` : undefined;

  if (!raw) {
    if (status === 'queued') return '已加入识别队列。';
    if (chunkLabel) return `${chunkLabel} 识别中…`;
    return '正在识别…';
  }

  if (raw === 'Queued locally, waiting for the transcription worker.') {
    return '已加入识别队列。';
  }
  if (raw === 'Preparing media for local transcription.') {
    return '正在准备本地识别任务…';
  }
  if (raw === 'Preparing media for cloud transcription.') {
    return '正在准备云端识别任务…';
  }
  if (raw === 'Calling Volcengine Doubao Speech API.') {
    return '正在调用火山引擎豆包语音识别…';
  }
  if (raw === 'Extracting audio from the video file.') {
    return '正在从视频中提取音频…';
  }
  if (raw === 'Reading media duration.') {
    return '正在读取媒体时长…';
  }
  if (raw === 'Inspecting media and preparing chunks.') {
    return '正在分析文件并准备分段…';
  }
  if (raw === 'Finalizing subtitle segments.') {
    return '正在整理最终字幕段落…';
  }
  if (raw === 'Merging chunk subtitles into the final timeline.') {
    return '正在合并所有分段字幕…';
  }
  if (raw === 'Running speaker diarization.') {
    return '正在区分不同说话人…';
  }
  if (raw === 'Transcription ready for review.') {
    return '识别完成，可以开始复核。';
  }
  if (raw === 'Primary model hit GPU memory limits, retrying with the fallback model.') {
    return '1.7B 模型显存不足，正在切换到 0.6B 重试…';
  }
  if (raw === 'Transcription failed.') {
    return '识别失败。';
  }

  const splitMatch = raw.match(/^Split long media into (\d+) chunks\.$/);
  if (splitMatch) {
    return `长文件将拆成 ${splitMatch[1]} 段顺序识别。`;
  }

  const transcribingMatch = raw.match(/^Transcribing chunk (\d+)\/(\d+)\.$/);
  if (transcribingMatch) {
    return `正在识别第 ${transcribingMatch[1]}/${transcribingMatch[2]} 段…`;
  }

  const finishedMatch = raw.match(/^Chunk finished, preparing subtitle segments\.$/);
  if (finishedMatch && chunkLabel) {
    return `${chunkLabel} 已完成，正在整理字幕…`;
  }
  if (raw === 'Preparing subtitle segments.') {
    return '正在整理字幕段落…';
  }

  if (chunkLabel && status === 'transcribing') {
    return `${chunkLabel} 识别中…`;
  }
  if (status === 'queued') {
    return '已加入本地识别队列。';
  }
  return raw;
}

function normalizeProgress(payload: TranscriptionJobPayload): TranscriptionProgress {
  const status = payload.status === 'done' || payload.status === 'error' || payload.status === 'queued'
    ? payload.status
    : 'transcribing';

  return {
    status,
    progress: Math.max(0, Math.min(100, Number(payload.progress) || 0)),
    message: localizeProgressMessage(payload, status),
    currentChunk: typeof payload.currentChunk === 'number' ? payload.currentChunk : undefined,
    totalChunks: typeof payload.totalChunks === 'number' ? payload.totalChunks : undefined,
  };
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function uploadFile(
  endpoint: string,
  file: File,
  onUploadProgress?: (percent: number) => void,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.timeout = 60 * 60 * 1000; // 1 hour for large files

    if (onUploadProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.addEventListener('load', () => {
      let body: unknown = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      resolve({ status: xhr.status, body });
    });
    xhr.addEventListener('error', () => reject(new Error('network')));
    xhr.addEventListener('timeout', () => reject(new Error('timeout')));
    xhr.addEventListener('abort', () => reject(new Error('abort')));

    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

async function createJob(
  file: File,
  provider: AsrProvider = 'local',
  onUploadProgress?: (percent: number) => void,
): Promise<TranscriptionJobPayload> {
  const endpoint = provider === 'cloud' ? '/api/transcribe/cloud/jobs' : '/api/transcribe/jobs';
  const serviceLabel = provider === 'cloud' ? '云端识别服务' : '本地识别服务';

  let result: { status: number; body: unknown };
  try {
    result = await uploadFile(endpoint, file, onUploadProgress);
  } catch (err) {
    const reason = err instanceof Error ? err.message : '';
    if (reason === 'timeout') {
      throw new Error('文件上传超时，请检查网络或尝试较小的文件。');
    }
    throw new Error(`${serviceLabel}没有启动，请先启动 local-asr。`);
  }

  const payload = result.body;
  if (result.status < 200 || result.status >= 300) {
    if ((result.status === 502 || result.status === 504 || result.status === 500) && payload === null) {
      throw new Error(`${serviceLabel}没有启动，请先启动 local-asr。`);
    }
    throw new Error(getErrorMessage(payload, `${serviceLabel}失败：HTTP ${result.status}`));
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error(`${serviceLabel}返回了无效结果。`);
  }

  return payload as TranscriptionJobPayload;
}

async function fetchJob(jobId: string): Promise<TranscriptionJobPayload> {
  const response = await fetch(`/api/transcribe/jobs/${encodeURIComponent(jobId)}`, {
    cache: 'no-store',
  });
  const payload = await parseJson(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, `进度轮询失败：HTTP ${response.status}`));
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('本地识别进度接口返回了无效结果。');
  }

  return payload as TranscriptionJobPayload;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function transcribeMedia(
  file: File,
  onProgress?: (progress: TranscriptionProgress) => void,
  provider: AsrProvider = 'local',
): Promise<TranscriptionResponse> {
  onProgress?.({ status: 'queued', progress: 0, message: '正在上传文件…' });

  const created = await createJob(file, provider, (uploadPercent) => {
    onProgress?.({
      status: 'queued',
      progress: Math.min(uploadPercent, 99),
      message: uploadPercent < 100 ? `正在上传文件… ${uploadPercent}%` : '上传完成，等待识别…',
    });
  });

  const jobId = typeof created.jobId === 'string' ? created.jobId : '';
  if (!jobId) {
    throw new Error('识别服务没有返回任务编号。');
  }

  // After upload completes, switch to backend-reported progress.
  // Use a high-water mark within the backend phase only to avoid regression
  // between polls, but NOT across the upload→backend boundary.
  let backendHighWater = 0;

  while (true) {
    const snapshot = await fetchJob(jobId);
    const progress = normalizeProgress(snapshot);
    if (progress.progress > backendHighWater) backendHighWater = progress.progress;
    onProgress?.({ ...progress, progress: Math.max(progress.progress, backendHighWater) });

    if (progress.status === 'done') {
      if (!snapshot.result || typeof snapshot.result !== 'object') {
        throw new Error('识别任务已完成，但没有返回结果。');
      }
      return normalizeResponse(snapshot.result);
    }

    if (progress.status === 'error') {
      throw new Error(snapshot.errorMessage || progress.message || '本地识别失败。');
    }

    await sleep(1500);
  }
}

import React, { useCallback, useState, useRef } from 'react';
import { useProjectStore } from '../stores/useProjectStore';
import { useSubtitleStore } from '../stores/useSubtitleStore';
import {
  CLOUD_ASR_MODEL,
  CLOUD_ASR_PROVIDER,
  DEFAULT_ASR_ALIGNER,
  DEFAULT_ASR_MODEL,
  LOCAL_ASR_PROVIDER,
  transcribeMedia,
  type AsrProvider,
  type TranscriptionProgress,
} from '../services/transcription';

const ACCEPTED_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.mp3', '.wav', '.m4a', '.aac'];
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.flv', '.wmv']);

function inferFileType(file: File): string {
  if (file.type) return file.type;
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
  const category = VIDEO_EXTENSIONS.has(ext) ? 'video' : 'audio';
  return `${category}/${ext.slice(1)}`;
}

export const DropZone: React.FC = () => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [asrProvider, setAsrProvider] = useState<AsrProvider>('local');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addJob = useProjectStore((s) => s.addJob);
  const saveSegments = useProjectStore((s) => s.saveSegments);
  const goLyrics = useProjectStore((s) => s.goLyrics);
  const updateJob = useProjectStore((s) => s.updateJob);

  const handleFiles = useCallback(
    (files: FileList) => {
      Array.from(files).forEach(async (file) => {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        if (!ACCEPTED_EXTENSIONS.includes(ext)) return;

        const isCloud = asrProvider === 'cloud';
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const job = {
          id: jobId,
          fileName: file.name,
          fileType: inferFileType(file),
          fileUrl: URL.createObjectURL(file),
          mediaAvailable: true,
          state: 'pending' as const,
          progress: 0,
          progressMessage: 'Waiting to start.',
          asrProvider: isCloud ? CLOUD_ASR_PROVIDER : LOCAL_ASR_PROVIDER,
          asrModel: isCloud ? CLOUD_ASR_MODEL : DEFAULT_ASR_MODEL,
          asrAligner: isCloud ? '' : DEFAULT_ASR_ALIGNER,
        };

        addJob(job);
        saveSegments(jobId, []);

        try {
          const result = await transcribeMedia(file, (progress: TranscriptionProgress) => {
            updateJob(jobId, {
              state: progress.status === 'queued' ? 'pending' : 'transcribing',
              progress: progress.progress,
              progressMessage: progress.message,
              errorMessage: undefined,
            });
          }, asrProvider);
          saveSegments(jobId, result.segments);
          updateJob(jobId, {
            state: 'done',
            progress: 100,
            progressMessage: 'Ready for review.',
            asrProvider: result.provider,
            asrModel: result.model,
            asrAligner: result.aligner,
            durationSeconds: result.durationSeconds,
            warnings: result.warnings,
            errorMessage: undefined,
          });
          useSubtitleStore.getState().setSegments(result.segments);
          goLyrics(jobId);
        } catch (error) {
          updateJob(jobId, {
            state: 'error',
            progress: 0,
            errorMessage: error instanceof Error ? error.message : '识别失败',
          });
        }
      });
    },
    [addJob, saveSegments, goLyrics, updateJob, asrProvider]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  return (
    <div className="flex flex-col items-center w-full h-full gap-4">
      {/* ASR Provider Toggle */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-800/60 border border-neutral-700/50">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setAsrProvider('local'); }}
          className={`px-4 py-2 text-sm rounded-lg transition-all duration-200 ${
            asrProvider === 'local'
              ? 'bg-neutral-600 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          本地识别
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setAsrProvider('cloud'); }}
          className={`px-4 py-2 text-sm rounded-lg transition-all duration-200 ${
            asrProvider === 'cloud'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          云端识别
        </button>
      </div>
      <p className="text-xs text-neutral-500">
        {asrProvider === 'local'
          ? '使用本地 Qwen3 ASR 模型，需要 GPU'
          : '使用阿里云 Paraformer-v2，按量计费约 2.5 元/小时'}
      </p>

      {/* Drop Zone */}
      <div
        id="drop-zone"
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          flex flex-col items-center justify-center
          w-full flex-1 min-h-[350px]
          border-2 border-dashed rounded-2xl
          transition-all duration-300 cursor-pointer
          ${isDragOver
            ? 'border-blue-400 bg-blue-500/10 scale-[1.01]'
            : 'border-neutral-600 bg-neutral-800/40 hover:border-neutral-400 hover:bg-neutral-800/60'
          }
        `}
      >
        <div className={`
          mb-6 w-20 h-20 rounded-2xl flex items-center justify-center
          transition-all duration-300
          ${isDragOver ? 'bg-blue-500/20 scale-110' : 'bg-neutral-700/50'}
        `}>
          <svg className={`w-10 h-10 transition-colors ${isDragOver ? 'text-blue-400' : 'text-neutral-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>

        <h2 className={`text-xl font-semibold mb-2 transition-colors ${isDragOver ? 'text-blue-300' : 'text-neutral-200'}`}>
          拖入音视频文件
        </h2>
        <p className="text-sm text-neutral-400 mb-4">
          或点击此处选择文件
        </p>
        <div className="flex gap-2">
          {['MP4', 'MOV', 'MKV', 'MP3', 'WAV', 'M4A', 'AAC'].map((fmt) => (
            <span key={fmt} className="px-2.5 py-1 text-xs rounded-md bg-neutral-700/60 text-neutral-400 font-mono">
              {fmt}
            </span>
          ))}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
};

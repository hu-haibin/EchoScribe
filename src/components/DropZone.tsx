import React, { useCallback, useState, useRef } from 'react';
import { useProjectStore } from '../stores/useProjectStore';
import { useSubtitleStore } from '../stores/useSubtitleStore';
import { DEFAULT_ASR_ALIGNER, DEFAULT_ASR_MODEL, LOCAL_ASR_PROVIDER, transcribeMedia, type TranscriptionProgress } from '../services/transcription';

const ACCEPTED_EXTENSIONS = ['.mp4', '.mov', '.mp3', '.wav', '.m4a', '.aac'];

export const DropZone: React.FC = () => {
  const [isDragOver, setIsDragOver] = useState(false);
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

        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const job = {
          id: jobId,
          fileName: file.name,
          fileType: file.type || `${ext.includes('mp') ? 'video' : 'audio'}/${ext.slice(1)}`,
          fileUrl: URL.createObjectURL(file),
          mediaAvailable: true,
          state: 'pending' as const,
          progress: 0,
          progressMessage: 'Waiting to start.',
          asrProvider: LOCAL_ASR_PROVIDER,
          asrModel: DEFAULT_ASR_MODEL,
          asrAligner: DEFAULT_ASR_ALIGNER,
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
          });
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
            errorMessage: error instanceof Error ? error.message : '本地识别失败',
          });
        }
      });
    },
    [addJob, saveSegments, goLyrics, updateJob]
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
    <div
      id="drop-zone"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => fileInputRef.current?.click()}
      className={`
        flex flex-col items-center justify-center
        w-full h-full min-h-[400px]
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
        {['MP4', 'MOV', 'MP3', 'WAV', 'M4A', 'AAC'].map((fmt) => (
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
  );
};

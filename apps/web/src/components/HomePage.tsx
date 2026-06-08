import React, { useCallback, useRef, useState } from 'react';
import { useProjectStore } from '../stores/useProjectStore';
import { useSubtitleStore } from '../stores/useSubtitleStore';
import { recreateFileFromObjectUrl, estimateMediaDuration } from '../services/localMedia';
import { saveMediaFile, removeMediaFile } from '../services/mediaDB';
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
import type { Job, Segment } from '../types';

const ACCEPTED_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.mp3', '.wav', '.m4a', '.aac'];
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.flv', '.wmv']);

function inferFileType(file: File): string {
  if (file.type) return file.type;
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
  const category = VIDEO_EXTENSIONS.has(ext) ? 'video' : 'audio';
  return `${category}/${ext.slice(1)}`;
}

function formatWait(seconds: number): string {
  if (seconds < 45) return `${Math.max(5, Math.round(seconds))} 秒`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} 分钟`;
  return `${(seconds / 3600).toFixed(1)} 小时`;
}

function estimateJobProcessingSeconds(job: Job): number {
  const mediaSeconds = job.durationSeconds && job.durationSeconds > 0 ? job.durationSeconds : 600;
  return Math.max(25, mediaSeconds * 0.18);
}

function estimateJobRemainingSeconds(job: Job): number {
  const total = estimateJobProcessingSeconds(job);
  if (job.state === 'transcribing') {
    const ratio = Math.max(0, Math.min(1, job.progress / 100));
    return Math.max(8, total * (1 - ratio));
  }
  if (job.state === 'pending') {
    return total;
  }
  return 0;
}

function getQueueInfo(jobId: string, jobs: Job[]) {
  const queue = jobs.filter((job) => job.state === 'pending' || job.state === 'transcribing');
  const index = queue.findIndex((job) => job.id === jobId);
  if (index < 0) return { aheadCount: 0, waitSeconds: 0 };
  const ahead = queue.slice(0, index);
  return {
    aheadCount: ahead.length,
    waitSeconds: ahead.reduce((sum, item) => sum + estimateJobRemainingSeconds(item), 0),
  };
}

function FileIcon({ type }: { type: string }) {
  const isVideo = type.startsWith('video');

  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
        isVideo ? 'bg-purple-500/15 text-purple-400' : 'bg-cyan-500/15 text-cyan-400'
      }`}
    >
      {isVideo ? (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
          />
        </svg>
      ) : (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z"
          />
        </svg>
      )}
    </div>
  );
}

export const HomePage: React.FC = () => {
  const jobs = useProjectStore((state) => state.jobs);
  const addJob = useProjectStore((state) => state.addJob);
  const removeJob = useProjectStore((state) => state.removeJob);
  const goLyrics = useProjectStore((state) => state.goLyrics);
  const saveSegments = useProjectStore((state) => state.saveSegments);
  const segmentsMap = useProjectStore((state) => state.segmentsMap);
  const updateJob = useProjectStore((state) => state.updateJob);

  const [isDragOver, setIsDragOver] = useState(false);
  const [asrProvider, setAsrProvider] = useState<AsrProvider>('local');
  const [importSummary, setImportSummary] = useState<{
    added: number;
    skipped: number;
    jobIds: string[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcriptionQueueRef = useRef<Promise<void>>(Promise.resolve());

  const hydrateDurationEstimate = useCallback(
    (jobId: string, file: File, fileType: string) => {
      void estimateMediaDuration(file, fileType)
        .then((durationSeconds) => {
          if (durationSeconds) {
            updateJob(jobId, { durationSeconds });
          }
        })
        .catch(() => undefined);
    },
    [updateJob]
  );

  const runTranscription = useCallback(
    async (jobId: string, file: File, openWhenDone: boolean, provider: AsrProvider) => {
      const isCloud = provider === 'cloud';
      updateJob(jobId, {
        state: 'pending',
        progress: 3,
        progressMessage: isCloud ? '正在上传到云端识别服务…' : '正在上传到本地识别服务…',
        errorMessage: undefined,
        warnings: [],
        asrProvider: isCloud ? CLOUD_ASR_PROVIDER : LOCAL_ASR_PROVIDER,
        asrModel: isCloud ? CLOUD_ASR_MODEL : DEFAULT_ASR_MODEL,
        asrAligner: isCloud ? '' : DEFAULT_ASR_ALIGNER,
      });

      try {
        const result = await transcribeMedia(file, (progress: TranscriptionProgress) => {
          updateJob(jobId, {
            state: progress.status === 'queued' ? 'pending' : 'transcribing',
            progress: progress.progress,
            progressMessage: progress.message,
            errorMessage: undefined,
          });
        }, provider);

        saveSegments(jobId, result.segments);
        updateJob(jobId, {
          state: 'done',
          progress: 100,
          progressMessage: '识别完成，可以开始复核。',
          durationSeconds: result.durationSeconds,
          warnings: result.warnings,
          errorMessage: undefined,
          asrProvider: result.provider,
          asrModel: result.model,
          asrAligner: result.aligner,
        });

        if (openWhenDone) {
          useSubtitleStore.getState().setSegments(result.segments);
          goLyrics(jobId);
        }
      } catch (error) {
        updateJob(jobId, {
          state: 'error',
          progress: 0,
          progressMessage: undefined,
          errorMessage: error instanceof Error ? error.message : '识别失败',
        });
      }
    },
    [goLyrics, saveSegments, updateJob]
  );

  const enqueueTranscription = useCallback(
    (jobId: string, file: File, openWhenDone: boolean, provider: AsrProvider) => {
      transcriptionQueueRef.current = transcriptionQueueRef.current
        .catch(() => undefined)
        .then(() => runTranscription(jobId, file, openWhenDone, provider));
    },
    [runTranscription]
  );

  const retryJob = useCallback(
    async (job: Job) => {
      if (!job.mediaAvailable || !job.fileUrl) {
        updateJob(job.id, {
          state: 'error',
          progress: 0,
          errorMessage: '当前会话里的原始媒体文件已经失效，请重新导入后再试。',
        });
        return;
      }

      try {
        const file = await recreateFileFromObjectUrl(job.fileUrl, job.fileName, job.fileType);
        saveSegments(job.id, []);
        updateJob(job.id, {
          state: 'pending',
          progress: 0,
          progressMessage: '已加入重试队列。',
          errorMessage: undefined,
          warnings: [],
        });
        if (!job.durationSeconds) {
          hydrateDurationEstimate(job.id, file, job.fileType);
        }
        const retryProvider: AsrProvider = job.asrProvider === CLOUD_ASR_PROVIDER ? 'cloud' : 'local';
        enqueueTranscription(job.id, file, false, retryProvider);
      } catch (error) {
        updateJob(job.id, {
          state: 'error',
          progress: 0,
          errorMessage: error instanceof Error ? error.message : '无法重新读取本地媒体文件',
        });
      }
    },
    [enqueueTranscription, hydrateDurationEstimate, saveSegments, updateJob]
  );

  const createJobFromFile = useCallback(
    (file: File, provider: AsrProvider) => {
      const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
      if (!ACCEPTED_EXTENSIONS.includes(ext)) return null;

      const isCloud = provider === 'cloud';
      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const fileType = inferFileType(file);
      const job: Job = {
        id: jobId,
        fileName: file.name,
        fileType,
        fileUrl: URL.createObjectURL(file),
        mediaAvailable: true,
        state: 'pending',
        progress: 0,
        progressMessage: '等待开始。',
        asrProvider: isCloud ? CLOUD_ASR_PROVIDER : LOCAL_ASR_PROVIDER,
        asrModel: isCloud ? CLOUD_ASR_MODEL : DEFAULT_ASR_MODEL,
        asrAligner: isCloud ? '' : DEFAULT_ASR_ALIGNER,
      };

      addJob(job);
      saveSegments(jobId, []);
      hydrateDurationEstimate(jobId, file, fileType);
      void saveMediaFile(jobId, file).catch(() => undefined);

      return { jobId, file };
    },
    [addJob, hydrateDurationEstimate, saveSegments]
  );

  const importFiles = useCallback(
    (files: File[]) => {
      const created: Array<{ jobId: string; file: File }> = [];
      let skipped = 0;

      files.forEach((file) => {
        const result = createJobFromFile(file, asrProvider);
        if (result) {
          created.push(result);
        } else {
          skipped += 1;
        }
      });

      if (created.length === 0) {
        setImportSummary({ added: 0, skipped, jobIds: [] });
        return;
      }

      setImportSummary({
        added: created.length,
        skipped,
        jobIds: created.map((item) => item.jobId),
      });

      created.forEach((item) => {
        enqueueTranscription(item.jobId, item.file, files.length === 1 && created.length === 1, asrProvider);
      });
    },
    [asrProvider, createJobFromFile, enqueueTranscription]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragOver(false);
      importFiles(Array.from(event.dataTransfer.files));
    },
    [importFiles]
  );

  const handleFileInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files) {
        importFiles(Array.from(event.target.files));
      }
      event.target.value = '';
    },
    [importFiles]
  );

  const openJob = useCallback(
    (jobId: string) => {
      const job = jobs.find((item) => item.id === jobId);
      if ((job?.state === 'pending' || job?.state === 'transcribing') && (segmentsMap[jobId] ?? []).length === 0) {
        return;
      }

      const nextSegments = segmentsMap[jobId] ?? [];
      useSubtitleStore.getState().setSegments(nextSegments);
      goLyrics(jobId);
    },
    [goLyrics, jobs, segmentsMap]
  );

  const getJobStats = useCallback(
    (jobId: string) => {
      const segments: Segment[] = segmentsMap[jobId] ?? [];
      const review = segments.filter((segment) => segment.status === 'review').length;
      const reviewed = Math.max(0, segments.length - review);

      return {
        total: segments.length,
        keep: segments.filter((segment) => segment.status === 'keep').length,
        deleted: segments.filter((segment) => segment.status === 'delete').length,
        important: segments.filter((segment) => segment.important).length,
        needsCheck: segments.filter((segment) => segment.needsCheck).length,
        review,
        progress: segments.length > 0 ? Math.round((reviewed / segments.length) * 100) : 0,
      };
    },
    [segmentsMap]
  );

  const workspaceStats = jobs.reduce(
    (summary, job) => {
      const stats = getJobStats(job.id);
      summary.totalSegments += stats.total;
      summary.review += stats.review;
      return summary;
    },
    { totalSegments: 0, review: 0 }
  );

  const firstReviewJob =
    jobs.find((job) => getJobStats(job.id).review > 0) ??
    jobs.find((job) => (segmentsMap[job.id] ?? []).length > 0);

  const transcribingJobs = jobs.filter((job) => job.state === 'pending' || job.state === 'transcribing');

  const startImportBatch = useCallback(() => {
    const jobId = importSummary?.jobIds.find((id) => (segmentsMap[id] ?? []).length > 0) ?? firstReviewJob?.id;
    if (jobId) {
      openJob(jobId);
    }
  }, [firstReviewJob?.id, importSummary?.jobIds, openJob, segmentsMap]);

  const canStartImportBatch = Boolean(
    importSummary?.jobIds.some((id) => (segmentsMap[id] ?? []).length > 0) || firstReviewJob
  );

  const renderImportSummary = () => {
    if (!importSummary) return null;

    return (
      <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-blue-100">
            {importSummary.added > 0 ? `已添加 ${importSummary.added} 个文件` : '没有可导入的文件'}
          </p>
          <p className="mt-0.5 text-xs text-blue-200/60">
            {importSummary.skipped > 0
              ? `已跳过 ${importSummary.skipped} 个不支持的文件`
              : importSummary.added === 1
                ? '正在识别，完成后会自动进入复核。'
                : '多文件会按顺序排队识别，已完成的文件可以先开始复核。'}
          </p>
        </div>
        {importSummary.added > 0 && jobs.length > 0 && (
          <button
            onClick={startImportBatch}
            disabled={!canStartImportBatch}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
          >
            {canStartImportBatch ? '开始复核' : '识别完成后复核'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      className="flex h-screen flex-col bg-[#0a0a0a]"
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-neutral-800/50 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">字</div>
          <h1 className="text-lg font-semibold text-neutral-100">字幕复核工具</h1>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          导入文件
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="hidden"
          onChange={handleFileInput}
        />
      </header>

      <div className="flex-1 overflow-auto px-6 py-6">
        <div className="mx-auto max-w-3xl">
          {/* ASR Provider Toggle */}
          <div className="mb-5 flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-xl bg-neutral-800/60 p-1 border border-neutral-700/50">
              <button
                type="button"
                onClick={() => setAsrProvider('local')}
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
                onClick={() => setAsrProvider('cloud')}
                className={`px-4 py-2 text-sm rounded-lg transition-all duration-200 ${
                  asrProvider === 'cloud'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                云端识别
              </button>
            </div>
            <span className="text-xs text-neutral-500">
              {asrProvider === 'local'
                ? '使用本地 Qwen3 ASR，需要 GPU'
                : '阿里云 Paraformer-v2，约 2.5 元/小时'}
            </span>
          </div>

          {renderImportSummary()}

          {jobs.length > 0 && (
            <div className="mb-8">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-neutral-100">任务工作台</h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    {jobs.length} 个文件
                    <span className="mx-1.5 text-neutral-700">·</span>
                    {workspaceStats.totalSegments} 条字幕
                    <span className="mx-1.5 text-neutral-700">·</span>
                    {workspaceStats.review} 条待复核
                    {transcribingJobs.length > 0 && (
                      <>
                        <span className="mx-1.5 text-neutral-700">·</span>
                        {transcribingJobs.length} 个识别中
                      </>
                    )}
                  </p>
                </div>
                {firstReviewJob && (
                  <button
                    onClick={() => openJob(firstReviewJob.id)}
                    className="shrink-0 rounded-lg bg-neutral-800 px-3 py-2 text-xs text-neutral-200 transition-colors hover:bg-neutral-700"
                  >
                    开始复核
                  </button>
                )}
              </div>

              <div className="space-y-1">
                {jobs.map((job) => {
                  const stats = getJobStats(job.id);
                  const queueInfo = getQueueInfo(job.id, jobs);
                  const transcribingRemaining = job.state === 'transcribing' ? estimateJobRemainingSeconds(job) : 0;
                  const canRetry = job.state === 'error' && job.mediaAvailable && Boolean(job.fileUrl);

                  let detail: React.ReactNode;
                  if (job.state === 'pending') {
                    detail = (
                      <>
                        <span>{job.progressMessage || '等待本地识别器处理…'}</span>
                        {queueInfo.aheadCount > 0 && (
                          <>
                            <span className="mx-1.5 text-neutral-700">·</span>
                            <span>前面还有 {queueInfo.aheadCount} 个文件</span>
                            <span className="mx-1.5 text-neutral-700">·</span>
                            <span>预计约 {formatWait(queueInfo.waitSeconds)}</span>
                          </>
                        )}
                        {job.progress > 0 && (
                          <>
                            <span className="mx-1.5 text-neutral-700">·</span>
                            <span>{job.progress}%</span>
                          </>
                        )}
                      </>
                    );
                  } else if (job.state === 'transcribing') {
                    detail = (
                      <>
                        <span>{job.progressMessage || '正在本地识别…'}</span>
                        <span className="mx-1.5 text-neutral-700">·</span>
                        <span>{job.progress}%</span>
                        {job.durationSeconds ? (
                          <>
                            <span className="mx-1.5 text-neutral-700">·</span>
                            <span>剩余约 {formatWait(transcribingRemaining)}</span>
                          </>
                        ) : null}
                      </>
                    );
                  } else if (job.state === 'error') {
                    detail = <span className="text-red-300/80">{job.errorMessage || '本地识别失败，请重试。'}</span>;
                  } else if (stats.total > 0) {
                    detail = (
                      <>
                        <span>{stats.total} 条字幕</span>
                        <span className="mx-1.5 text-neutral-700">·</span>
                        <span className="text-green-500">{stats.keep} 保留</span>
                        <span className="mx-1 text-neutral-700">·</span>
                        <span className="text-red-400">{stats.deleted} 删除</span>
                        <span className="mx-1 text-neutral-700">·</span>
                        <span className="text-amber-400">{stats.important} 重点</span>
                        <span className="mx-1 text-neutral-700">·</span>
                        <span className="text-blue-400">{stats.review} 待复核</span>
                        {stats.needsCheck > 0 && (
                          <>
                            <span className="mx-1 text-neutral-700">·</span>
                            <span className="text-sky-400">{stats.needsCheck} 待确认</span>
                          </>
                        )}
                      </>
                    );
                  } else {
                    detail = <span>等待转写结果…</span>;
                  }

                  return (
                    <div
                      key={job.id}
                      className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 transition-all hover:bg-neutral-800/60"
                    >
                      <button onClick={() => openJob(job.id)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                        <FileIcon type={job.fileType} />

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-neutral-200 transition-colors group-hover:text-white">
                              {job.fileName}
                            </p>
                            {job.state === 'pending' ? (
                              <span className="shrink-0 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">排队中</span>
                            ) : job.state === 'transcribing' ? (
                              <span className="shrink-0 rounded-md bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300">识别中</span>
                            ) : job.state === 'error' ? (
                              <span className="shrink-0 rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-300">失败</span>
                            ) : stats.review > 0 ? (
                              <span className="shrink-0 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-300">待复核</span>
                            ) : (
                              <span className="shrink-0 rounded-md bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-300">已复核</span>
                            )}
                          </div>

                          <p className="mt-0.5 text-xs text-neutral-500">{detail}</p>

                          {(stats.total > 0 || job.state === 'pending' || job.state === 'transcribing') && (
                            <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-800">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  job.state === 'pending'
                                    ? 'bg-amber-400'
                                    : job.state === 'transcribing'
                                      ? 'bg-cyan-400'
                                      : 'bg-blue-500'
                                }`}
                                style={{
                                  width: `${job.state === 'pending' || job.state === 'transcribing' ? job.progress : stats.progress}%`,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center gap-2">
                        {canRetry && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              void retryJob(job);
                            }}
                            className="rounded-lg bg-neutral-800 px-2.5 py-1.5 text-[11px] text-neutral-200 transition-colors hover:bg-neutral-700"
                            title="重试识别"
                          >
                            重试
                          </button>
                        )}
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            removeJob(job.id);
                            void removeMediaFile(job.id).catch(() => undefined);
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-600 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 md:opacity-0"
                          title="删除"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                            />
                          </svg>
                        </button>
                        <svg className="h-4 w-4 text-neutral-600 transition-colors group-hover:text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-16 transition-all duration-300 ${
              isDragOver
                ? 'scale-[1.01] border-blue-400 bg-blue-500/10'
                : jobs.length > 0
                  ? 'border-neutral-800 bg-neutral-900/30 py-10 hover:border-neutral-600 hover:bg-neutral-800/40'
                  : 'border-neutral-600 bg-neutral-800/40 hover:border-neutral-400 hover:bg-neutral-800/60'
            }`}
          >
            <div
              className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl transition-all ${
                isDragOver ? 'scale-110 bg-blue-500/20' : 'bg-neutral-700/50'
              }`}
            >
              <svg className={`h-8 w-8 transition-colors ${isDragOver ? 'text-blue-400' : 'text-neutral-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <p className={`mb-1 text-base font-medium ${isDragOver ? 'text-blue-300' : 'text-neutral-300'}`}>
              {jobs.length > 0 ? '导入更多文件' : '拖入音视频文件'}
            </p>
            <p className="text-xs text-neutral-500">支持 MP4 / MOV / MKV / MP3 / WAV / M4A / AAC</p>
          </div>
        </div>
      </div>

      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-blue-400/40 bg-blue-500/5">
          <div className="rounded-2xl border border-blue-500/20 bg-neutral-900/90 px-8 py-4 backdrop-blur-sm">
            <p className="text-lg font-medium text-blue-300">释放以导入文件</p>
          </div>
        </div>
      )}
    </div>
  );
};

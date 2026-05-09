import React, { useCallback, useState, useRef } from 'react';
import { useProjectStore } from '../stores/useProjectStore';
import { useSubtitleStore } from '../stores/useSubtitleStore';
import { generateMockSegments } from '../mock/mockSegments';
import type { Segment } from '../types';

const ACCEPTED_EXTENSIONS = ['.mp4', '.mov', '.mp3', '.wav', '.m4a'];

/** 文件类型图标 */
function FileIcon({ type }: { type: string }) {
  const isVideo = type.startsWith('video');
  return (
    <div className={`
      w-10 h-10 rounded-xl flex items-center justify-center shrink-0
      ${isVideo ? 'bg-purple-500/15 text-purple-400' : 'bg-cyan-500/15 text-cyan-400'}
    `}>
      {isVideo ? (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
        </svg>
      )}
    </div>
  );
}

export const HomePage: React.FC = () => {
  const jobs = useProjectStore((s) => s.jobs);
  const addJob = useProjectStore((s) => s.addJob);
  const removeJob = useProjectStore((s) => s.removeJob);
  const goLyrics = useProjectStore((s) => s.goLyrics);
  const saveSegments = useProjectStore((s) => s.saveSegments);
  const segmentsMap = useProjectStore((s) => s.segmentsMap);

  const [isDragOver, setIsDragOver] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    added: number;
    skipped: number;
    jobIds: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createJobFromFile = useCallback(
    (file: File) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(ext)) return null;

      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const job = {
        id: jobId,
        fileName: file.name,
        fileType: file.type || `${ext.includes('mp') && ext !== '.mp3' ? 'video' : 'audio'}/${ext.slice(1)}`,
        fileUrl: URL.createObjectURL(file),
        state: 'done' as const,
        progress: 100,
      };

      // MVP: 生成 mock 字幕
      const segments = generateMockSegments(500);
      addJob(job);
      saveSegments(jobId, segments);

      return { jobId, segments };
    },
    [addJob, saveSegments]
  );

  const importFiles = useCallback(
    (files: File[]) => {
      const created: Array<{ jobId: string; segments: Segment[] }> = [];
      let skipped = 0;

      files.forEach((file) => {
        const result = createJobFromFile(file);
        if (result) {
          created.push(result);
        } else {
          skipped++;
        }
      });

      if (created.length === 0) {
        setImportSummary({ added: 0, skipped, jobIds: [] });
        return;
      }

      // 单文件导入保持快速路径；多文件导入停留在任务工作台，先建立全局感。
      if (files.length === 1 && created.length === 1) {
        setImportSummary(null);
        useSubtitleStore.getState().setSegments(created[0].segments);
        goLyrics(created[0].jobId);
        return;
      }

      setImportSummary({
        added: created.length,
        skipped,
        jobIds: created.map((item) => item.jobId),
      });
    },
    [createJobFromFile, goLyrics]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      importFiles(Array.from(e.dataTransfer.files));
    },
    [importFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        importFiles(Array.from(e.target.files));
      }
      e.target.value = '';
    },
    [importFiles]
  );

  const openJob = useCallback(
    (jobId: string) => {
      const segs = segmentsMap[jobId] ?? [];
      useSubtitleStore.getState().setSegments(segs);
      goLyrics(jobId);
    },
    [segmentsMap, goLyrics]
  );

  const getJobStats = (jobId: string) => {
    const segs: Segment[] = segmentsMap[jobId] ?? [];
    const review = segs.filter((s) => s.status === 'review').length;
    const reviewed = Math.max(0, segs.length - review);
    return {
      total: segs.length,
      keep: segs.filter((s) => s.status === 'keep').length,
      deleted: segs.filter((s) => s.status === 'delete').length,
      important: segs.filter((s) => s.status === 'important').length,
      review,
      progress: segs.length > 0 ? Math.round((reviewed / segs.length) * 100) : 0,
    };
  };

  const workspaceStats = jobs.reduce(
    (acc, job) => {
      const stats = getJobStats(job.id);
      acc.totalSegments += stats.total;
      acc.review += stats.review;
      return acc;
    },
    { totalSegments: 0, review: 0 }
  );

  const firstReviewJob = jobs.find((job) => getJobStats(job.id).review > 0) ?? jobs[0];

  const startImportBatch = useCallback(() => {
    const jobId = importSummary?.jobIds.find((id) => jobs.some((job) => job.id === id)) ?? firstReviewJob?.id;
    if (jobId) openJob(jobId);
  }, [firstReviewJob?.id, importSummary?.jobIds, jobs, openJob]);

  return (
    <div
      className="h-screen flex flex-col bg-[#0a0a0a]"
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {/* 顶栏 */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-800/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white text-sm font-bold">字</div>
          <h1 className="text-lg font-semibold text-neutral-100">字幕复盘工具</h1>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/20"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

      {/* 主内容 */}
      <div className="flex-1 overflow-auto px-6 py-6">
        {jobs.length > 0 ? (
          <div className="max-w-3xl mx-auto">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-neutral-100">任务工作台</h2>
                <p className="mt-1 text-xs text-neutral-500">
                  {jobs.length} 个文件
                  <span className="mx-1.5 text-neutral-700">·</span>
                  {workspaceStats.totalSegments} 条字幕
                  <span className="mx-1.5 text-neutral-700">·</span>
                  {workspaceStats.review} 条待检查
                </p>
              </div>
              {firstReviewJob && (
                <button
                  onClick={() => openJob(firstReviewJob.id)}
                  className="shrink-0 px-3 py-2 text-xs rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
                >
                  开始复核
                </button>
              )}
            </div>

            {importSummary && (
              <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-blue-100">
                    {importSummary.added > 0 ? `已添加 ${importSummary.added} 个文件` : '没有可导入的文件'}
                  </p>
                  <p className="mt-0.5 text-xs text-blue-200/60">
                    {importSummary.skipped > 0
                      ? `已跳过 ${importSummary.skipped} 个不支持的文件`
                      : '多文件会先留在任务工作台，方便你确认队列再开始复核'}
                  </p>
                </div>
                {importSummary.added > 0 && (
                  <button
                    onClick={startImportBatch}
                    className="shrink-0 px-3 py-2 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                  >
                    复核第一个
                  </button>
                )}
              </div>
            )}

            <div className="space-y-1">
              {jobs.map((job) => {
                const stats = getJobStats(job.id);
                return (
                  <div
                    key={job.id}
                    className="group w-full flex items-center gap-3 rounded-xl px-3 py-3 transition-all hover:bg-neutral-800/60"
                  >
                    <button
                      onClick={() => openJob(job.id)}
                      className="flex min-w-0 flex-1 items-center gap-4 text-left"
                    >
                      <FileIcon type={job.fileType} />

                      {/* 文件信息 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-neutral-200 transition-colors group-hover:text-white">
                            {job.fileName}
                          </p>
                          {stats.review > 0 ? (
                            <span className="shrink-0 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-300">
                              待复核
                            </span>
                          ) : (
                            <span className="shrink-0 rounded-md bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-300">
                              已检查
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {stats.total > 0 ? (
                            <>
                              {stats.total} 条字幕
                              <span className="mx-1.5 text-neutral-700">·</span>
                              <span className="text-green-500">{stats.keep}</span> 保留
                              <span className="mx-1 text-neutral-700">·</span>
                              <span className="text-red-400">{stats.deleted}</span> 删除
                              <span className="mx-1 text-neutral-700">·</span>
                              <span className="text-amber-400">{stats.important}</span> 重点
                              <span className="mx-1 text-neutral-700">·</span>
                              <span className="text-blue-400">{stats.review}</span> 待检查
                            </>
                          ) : (
                            '等待转写...'
                          )}
                        </p>
                        {stats.total > 0 && (
                          <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-800">
                            <div
                              className="h-full rounded-full bg-blue-500 transition-all"
                              style={{ width: `${stats.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </button>

                    {/* 右侧箭头 + 删除 */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeJob(job.id);
                        }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-600 opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="删除"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                      <svg className="w-4 h-4 text-neutral-600 group-hover:text-neutral-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* 底部 DropZone */}
        <div className="max-w-3xl mx-auto mt-8">
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`
              flex flex-col items-center justify-center py-16 rounded-2xl border-2 border-dashed
              cursor-pointer transition-all duration-300
              ${isDragOver
                ? 'border-blue-400 bg-blue-500/10 scale-[1.01]'
                : jobs.length > 0
                  ? 'border-neutral-800 bg-neutral-900/30 hover:border-neutral-600 hover:bg-neutral-800/40 py-10'
                  : 'border-neutral-600 bg-neutral-800/40 hover:border-neutral-400 hover:bg-neutral-800/60'
              }
            `}
          >
            <div className={`
              mb-4 w-16 h-16 rounded-2xl flex items-center justify-center transition-all
              ${isDragOver ? 'bg-blue-500/20 scale-110' : 'bg-neutral-700/50'}
            `}>
              <svg className={`w-8 h-8 transition-colors ${isDragOver ? 'text-blue-400' : 'text-neutral-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <p className={`text-base font-medium mb-1 ${isDragOver ? 'text-blue-300' : 'text-neutral-300'}`}>
              {jobs.length > 0 ? '导入更多文件' : '拖入音视频文件'}
            </p>
            <p className="text-xs text-neutral-500">
              支持 MP4 / MOV / MP3 / WAV / M4A
            </p>
          </div>
        </div>
      </div>

      {/* 拖拽覆盖层 */}
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-500/5 border-2 border-dashed border-blue-400/40 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-neutral-900/90 backdrop-blur-sm px-8 py-4 rounded-2xl border border-blue-500/20">
            <p className="text-blue-300 text-lg font-medium">释放以导入文件</p>
          </div>
        </div>
      )}
    </div>
  );
};

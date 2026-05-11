import React, { useCallback, useState, useRef, useEffect } from 'react';
import { HomePage } from './components/HomePage';
import { LyricsView } from './components/LyricsView';
import { PlayerBar } from './components/PlayerBar';
import { ExportMenu } from './components/ExportMenu';
import { ConfirmDialog } from './components/ConfirmDialog';
import { useProjectStore } from './stores/useProjectStore';
import { useSubtitleStore } from './stores/useSubtitleStore';
import { estimateMediaDuration, recreateFileFromObjectUrl } from './services/localMedia';
import { generateMockSegments } from './mock/mockSegments';
import { DEFAULT_ASR_ALIGNER, DEFAULT_ASR_MODEL, LOCAL_ASR_PROVIDER, transcribeMedia, type TranscriptionProgress } from './services/transcription';

const ACCEPTED_EXTENSIONS = ['.mp4', '.mov', '.mp3', '.wav', '.m4a', '.aac'];

const App: React.FC = () => {
  const page = useProjectStore((s) => s.page);
  const jobs = useProjectStore((s) => s.jobs);
  const activeJobId = useProjectStore((s) => s.activeJobId);
  const addJob = useProjectStore((s) => s.addJob);
  const goHome = useProjectStore((s) => s.goHome);
  const goLyrics = useProjectStore((s) => s.goLyrics);
  const saveSegments = useProjectStore((s) => s.saveSegments);
  const segmentsMap = useProjectStore((s) => s.segmentsMap);
  const updateJob = useProjectStore((s) => s.updateJob);
  const updateJobMedia = useProjectStore((s) => s.updateJobMedia);
  const segments = useSubtitleStore((s) => s.segments);
  const setSegments = useSubtitleStore((s) => s.setSegments);

  const activeJob = jobs.find((j) => j.id === activeJobId);
  const activeJobIndex = jobs.findIndex((j) => j.id === activeJobId);
  const currentReviewCount = segments.filter((s) => s.status === 'review').length;
  const checkedCount = Math.max(0, segments.length - currentReviewCount);
  const reviewProgress = segments.length > 0 ? Math.round((checkedCount / segments.length) * 100) : 0;
  const nextReviewJob = jobs.find((job) => {
    if (job.id === activeJobId) return false;
    const jobSegments = segmentsMap[job.id] ?? [];
    return jobSegments.some((segment) => segment.status === 'review');
  });

  // ===== 歌词页拖入确认 =====
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isJobMenuOpen, setIsJobMenuOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const loadedJobRef = useRef<string | null>(null);

  useEffect(() => {
    if (page !== 'lyrics' || !activeJobId) return;
    if (loadedJobRef.current === activeJobId && segments.length > 0) return;
    const storedSegments = segmentsMap[activeJobId] ?? [];
    setSegments(storedSegments);
    loadedJobRef.current = activeJobId;
  }, [page, activeJobId, segments.length, segmentsMap, setSegments]);

  useEffect(() => {
    if (page !== 'lyrics' || !activeJobId) return;
    const storedSegments = useProjectStore.getState().segmentsMap[activeJobId] ?? [];
    if (segments.length === 0 && storedSegments.length > 0) return;
    saveSegments(activeJobId, segments);
    setSavedAt(new Date());
  }, [page, activeJobId, segments, saveSegments]);

  useEffect(() => {
    const preventWindowFileDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
    };

    window.addEventListener('dragover', preventWindowFileDrop);
    window.addEventListener('drop', preventWindowFileDrop);
    return () => {
      window.removeEventListener('dragover', preventWindowFileDrop);
      window.removeEventListener('drop', preventWindowFileDrop);
    };
  }, []);

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

  const getJobReviewCount = useCallback(
    (jobId: string) => {
      const jobSegments = jobId === activeJobId ? segments : (segmentsMap[jobId] ?? []);
      return jobSegments.filter((segment) => segment.status === 'review').length;
    },
    [activeJobId, segments, segmentsMap]
  );

  // 在离开歌词页时，保存当前字幕状态
  const handleGoHome = useCallback(() => {
    if (activeJobId) {
      saveSegments(activeJobId, segments);
    }
    goHome();
  }, [activeJobId, segments, saveSegments, goHome]);

  const switchToJob = useCallback(
    (jobId: string) => {
      if (activeJobId) {
        saveSegments(activeJobId, segments);
      }
      const nextSegments = jobId === activeJobId ? segments : (segmentsMap[jobId] ?? []);
      setSegments(nextSegments);
      goLyrics(jobId);
      setIsJobMenuOpen(false);
    },
    [activeJobId, segments, segmentsMap, saveSegments, setSegments, goLyrics]
  );

  const handleRestoreMedia = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !activeJobId) return;

      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(ext)) return;

      updateJobMedia(
        activeJobId,
        file.name,
        file.type || `${ext.includes('mp') && ext !== '.mp3' ? 'video' : 'audio'}/${ext.slice(1)}`,
        URL.createObjectURL(file)
      );
    },
    [activeJobId, updateJobMedia]
  );

  const handleOpenNextReview = useCallback(() => {
    if (nextReviewJob) {
      switchToJob(nextReviewJob.id);
      return;
    }
    if (jobs.length <= 1 || activeJobIndex < 0) return;
    const nextJob = jobs[(activeJobIndex + 1) % jobs.length];
    switchToJob(nextJob.id);
  }, [activeJobIndex, jobs, nextReviewJob, switchToJob]);

  // 歌词页拖入文件处理
  const handleLyricsDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      const validFile = files.find((f) => {
        const ext = '.' + f.name.split('.').pop()?.toLowerCase();
        return ACCEPTED_EXTENSIONS.includes(ext);
      });
      if (validFile) {
        setPendingFile(validFile);
      }
    },
    []
  );

  // 确认弹窗：替换当前
  const handleReplace = useCallback(async () => {
    if (!pendingFile || !activeJobId) return;
    const file = pendingFile;
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const jobId = activeJobId;

      updateJob(jobId, {
        fileName: file.name,
        fileType: file.type || `${ext.includes('mp') && ext !== '.mp3' ? 'video' : 'audio'}/${ext.slice(1)}`,
        fileUrl: URL.createObjectURL(file),
        mediaAvailable: true,
        state: 'pending',
        progress: 3,
        progressMessage: '正在上传到本地识别服务…',
        asrProvider: LOCAL_ASR_PROVIDER,
        asrModel: DEFAULT_ASR_MODEL,
        asrAligner: DEFAULT_ASR_ALIGNER,
        errorMessage: undefined,
        warnings: [],
    });
    saveSegments(jobId, []);
    hydrateDurationEstimate(jobId, file, file.type || `${ext.includes('mp') && ext !== '.mp3' ? 'video' : 'audio'}/${ext.slice(1)}`);
    setSegments([]);
    goLyrics(jobId);
    setPendingFile(null);

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
        progressMessage: '识别完成，可以开始复核。',
        asrProvider: result.provider,
        asrModel: result.model,
        asrAligner: result.aligner,
        durationSeconds: result.durationSeconds,
        warnings: result.warnings,
        errorMessage: undefined,
      });
      if (useProjectStore.getState().activeJobId === jobId) {
        setSegments(result.segments);
      }
    } catch (error) {
      updateJob(jobId, {
        state: 'error',
        progress: 0,
        progressMessage: undefined,
        errorMessage: error instanceof Error ? error.message : '本地识别失败',
      });
    }
  }, [pendingFile, activeJobId, updateJob, saveSegments, hydrateDurationEstimate, setSegments, goLyrics]);

  // 确认弹窗：新建任务
  const handleNewTask = useCallback(async () => {
    if (!pendingFile) return;
    const file = pendingFile;
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const job = {
        id: jobId,
        fileName: file.name,
        fileType: file.type || `${ext.includes('mp') && ext !== '.mp3' ? 'video' : 'audio'}/${ext.slice(1)}`,
      fileUrl: URL.createObjectURL(file),
        mediaAvailable: true,
        state: 'pending' as const,
        progress: 0,
        progressMessage: '等待开始。',
        asrProvider: LOCAL_ASR_PROVIDER,
        asrModel: DEFAULT_ASR_MODEL,
        asrAligner: DEFAULT_ASR_ALIGNER,
      };

    // 先保存当前歌词页状态
    if (activeJobId) {
      saveSegments(activeJobId, segments);
    }

    addJob(job);
    saveSegments(jobId, []);
    hydrateDurationEstimate(jobId, file, file.type || `${ext.includes('mp') && ext !== '.mp3' ? 'video' : 'audio'}/${ext.slice(1)}`);
    setPendingFile(null);
    goHome();

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
        progressMessage: '识别完成，可以开始复核。',
        asrProvider: result.provider,
        asrModel: result.model,
        asrAligner: result.aligner,
        durationSeconds: result.durationSeconds,
        warnings: result.warnings,
        errorMessage: undefined,
      });
    } catch (error) {
      updateJob(jobId, {
        state: 'error',
        progress: 0,
        progressMessage: undefined,
        errorMessage: error instanceof Error ? error.message : '本地识别失败',
      });
    }
  }, [pendingFile, activeJobId, segments, addJob, saveSegments, hydrateDurationEstimate, goHome, updateJob]);

  const retryActiveJob = useCallback(async () => {
    if (!activeJob || !activeJob.fileUrl || !activeJob.mediaAvailable) return;

    try {
      const file = await recreateFileFromObjectUrl(activeJob.fileUrl, activeJob.fileName, activeJob.fileType);
      saveSegments(activeJob.id, []);
      setSegments([]);
      updateJob(activeJob.id, {
        state: 'pending',
        progress: 3,
        progressMessage: '正在上传到本地识别服务…',
        errorMessage: undefined,
        warnings: [],
      });
      hydrateDurationEstimate(activeJob.id, file, activeJob.fileType);

      const result = await transcribeMedia(file, (progress: TranscriptionProgress) => {
        updateJob(activeJob.id, {
          state: progress.status === 'queued' ? 'pending' : 'transcribing',
          progress: progress.progress,
          progressMessage: progress.message,
          errorMessage: undefined,
        });
      });

      saveSegments(activeJob.id, result.segments);
      updateJob(activeJob.id, {
        state: 'done',
        progress: 100,
        progressMessage: '识别完成，可以开始复核。',
        asrProvider: result.provider,
        asrModel: result.model,
        asrAligner: result.aligner,
        durationSeconds: result.durationSeconds,
        warnings: result.warnings,
        errorMessage: undefined,
      });
      if (useProjectStore.getState().activeJobId === activeJob.id) {
        setSegments(result.segments);
      }
    } catch (error) {
      updateJob(activeJob.id, {
        state: 'error',
        progress: 0,
        progressMessage: undefined,
        errorMessage: error instanceof Error ? error.message : '本地识别失败',
      });
    }
  }, [activeJob, hydrateDurationEstimate, saveSegments, setSegments, updateJob]);

  // ===== URL demo 模式 =====
  const demoInitRef = useRef(false);
  useEffect(() => {
    if (demoInitRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') {
      demoInitRef.current = true;
      const jobId = 'demo_job';
      const mockSegs = generateMockSegments(500);
      addJob({
        id: jobId,
        fileName: '复盘会议录音_demo.mp4',
        fileType: 'video/mp4',
        fileUrl: '',
        mediaAvailable: false,
        state: 'done',
        progress: 100,
      });
      saveSegments(jobId, mockSegs);
      setSegments(mockSegs);
      goLyrics(jobId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 渲染 =====

  // 首页
  if (page === 'home') {
    return <HomePage />;
  }

  // 歌词页
  return (
    <div
      className="h-screen flex flex-col bg-[#0a0a0a] relative"
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleLyricsDrop}
    >
      {/* 顶部悬浮栏 */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-3 bg-gradient-to-b from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          {/* 返回按钮 */}
          <button
            onClick={handleGoHome}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
            title="返回首页"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>

          <div className="relative">
            <button
              onClick={() => setIsJobMenuOpen((open) => !open)}
              className="flex max-w-[44vw] items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-neutral-800/70"
              title="切换文件"
            >
              <span className="truncate text-sm font-medium text-neutral-200">
                {activeJob?.fileName ?? '字幕复盘'}
              </span>
              {jobs.length > 1 && (
                <svg className={`h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform ${isJobMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              )}
            </button>
            <p className="px-1.5 text-[11px] text-neutral-500">
              已复核 {checkedCount}/{segments.length}
              <span className="mx-1.5 text-neutral-700">·</span>
              {reviewProgress}%
              <span className="mx-1.5 text-neutral-700">·</span>
              {savedAt ? '已保存' : '保存中'}
            </p>

            {isJobMenuOpen && jobs.length > 1 && (
              <div className="absolute left-0 top-full mt-2 w-80 overflow-hidden rounded-xl border border-neutral-700/60 bg-neutral-900/95 shadow-2xl backdrop-blur-xl">
                <div className="max-h-80 overflow-auto p-1">
                  {jobs.map((job) => {
                    const reviewCount = getJobReviewCount(job.id);
                    const isActive = job.id === activeJobId;
                    return (
                      <button
                        key={job.id}
                        onClick={() => switchToJob(job.id)}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                          isActive ? 'bg-blue-500/15 text-white' : 'text-neutral-300 hover:bg-neutral-800'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{job.fileName}</span>
                          <span className="mt-0.5 block text-xs text-neutral-500">
                            {reviewCount > 0 ? `${reviewCount} 条待复核` : '已复核'}
                          </span>
                        </span>
                        {isActive && (
                          <span className="shrink-0 text-xs text-blue-300">当前</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          {jobs.length > 1 && (
            <button
              onClick={handleOpenNextReview}
              className="px-3 py-1.5 text-xs rounded-lg bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300 transition-colors"
              title={nextReviewJob ? '打开下一个待复核文件' : '打开下一个文件'}
            >
              下一个
            </button>
          )}
          <ExportMenu />
        </div>
      </header>

      {activeJob?.state === 'error' && (
        <div className="pointer-events-none absolute left-0 right-0 top-16 z-20 px-5">
          <div className="pointer-events-auto mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 backdrop-blur-sm">
            <div className="min-w-0">
              <p className="text-sm font-medium text-red-100">当前文件识别失败</p>
              <p className="mt-0.5 text-xs text-red-200/70">
                {activeJob.errorMessage || '可以直接重试当前文件，不需要重新导入。'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {activeJob.mediaAvailable && activeJob.fileUrl ? (
                <button
                  onClick={() => void retryActiveJob()}
                  className="rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-100 transition-colors hover:bg-red-500/25"
                >
                  重试识别
                </button>
              ) : (
                <button
                  onClick={() => mediaInputRef.current?.click()}
                  className="rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-100 transition-colors hover:bg-red-500/25"
                >
                  重新选择媒体
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 歌词主体 */}
      <LyricsView />

      {/* 底部渐变遮罩 */}
      <div
        className={`absolute left-0 right-0 h-24 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none z-10 ${
          activeJob?.mediaAvailable && activeJob.fileType.startsWith('video') ? 'bottom-[330px]' : 'bottom-[108px]'
        }`}
      />

      <input
        ref={mediaInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="hidden"
        onChange={handleRestoreMedia}
      />

      {/* 底部播放器 */}
      {activeJob && activeJob.mediaAvailable ? (
        <PlayerBar jobId={activeJob.id} fileUrl={activeJob.fileUrl} fileType={activeJob.fileType} />
      ) : activeJob ? (
        <div id="missing-media-panel" className="shrink-0 border-t border-neutral-800/60 bg-neutral-900/90 px-6 py-4">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-neutral-200">字幕进度已恢复，原始媒体需要重新选择</p>
              <p className="mt-0.5 text-xs text-neutral-500">浏览器刷新后不会保留本地音视频文件；重新选择后会保留当前字幕和复核状态。</p>
            </div>
            <button
              onClick={() => mediaInputRef.current?.click()}
              className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs text-white transition-colors hover:bg-blue-500"
            >
              重新选择音视频
            </button>
          </div>
        </div>
      ) : null}

      {/* 拖拽覆盖层 */}
      {isDragOver && !pendingFile && (
        <div className="absolute inset-0 bg-blue-500/5 border-2 border-dashed border-blue-400/40 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-neutral-900/90 backdrop-blur-sm px-8 py-4 rounded-2xl border border-blue-500/20">
            <p className="text-blue-300 text-lg font-medium">释放以导入文件</p>
          </div>
        </div>
      )}

      {/* 拖入确认弹窗 */}
      {pendingFile && (
        <ConfirmDialog
          fileName={pendingFile.name}
          onReplace={handleReplace}
          onNewTask={handleNewTask}
          onCancel={() => setPendingFile(null)}
        />
      )}
    </div>
  );
};

export default App;

import React, { useCallback, useState, useRef, useEffect } from 'react';
import { HomePage } from './components/HomePage';
import { LyricsView } from './components/LyricsView';
import { PlayerBar } from './components/PlayerBar';
import { ExportMenu } from './components/ExportMenu';
import { ConfirmDialog } from './components/ConfirmDialog';
import { useProjectStore } from './stores/useProjectStore';
import { useSubtitleStore } from './stores/useSubtitleStore';
import { generateMockSegments } from './mock/mockSegments';

const ACCEPTED_EXTENSIONS = ['.mp4', '.mov', '.mp3', '.wav', '.m4a'];

const App: React.FC = () => {
  const page = useProjectStore((s) => s.page);
  const jobs = useProjectStore((s) => s.jobs);
  const activeJobId = useProjectStore((s) => s.activeJobId);
  const addJob = useProjectStore((s) => s.addJob);
  const goHome = useProjectStore((s) => s.goHome);
  const goLyrics = useProjectStore((s) => s.goLyrics);
  const saveSegments = useProjectStore((s) => s.saveSegments);
  const segments = useSubtitleStore((s) => s.segments);
  const setSegments = useSubtitleStore((s) => s.setSegments);

  const activeJob = jobs.find((j) => j.id === activeJobId);

  // ===== 歌词页拖入确认 =====
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // 在离开歌词页时，保存当前字幕状态
  const handleGoHome = useCallback(() => {
    if (activeJobId) {
      saveSegments(activeJobId, segments);
    }
    goHome();
  }, [activeJobId, segments, saveSegments, goHome]);

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
  const handleReplace = useCallback(() => {
    if (!pendingFile || !activeJobId) return;
    const file = pendingFile;
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    // 更新当前 job
    const newJob = {
      id: activeJobId,
      fileName: file.name,
      fileType: file.type || `${ext.includes('mp') && ext !== '.mp3' ? 'video' : 'audio'}/${ext.slice(1)}`,
      fileUrl: URL.createObjectURL(file),
      state: 'done' as const,
      progress: 100,
    };

    // MVP: 生成新 mock 字幕
    const newSegments = generateMockSegments(500);
    // Remove old job, add new one with same id
    useProjectStore.getState().removeJob(activeJobId);
    addJob(newJob);
    saveSegments(activeJobId, newSegments);
    setSegments(newSegments);
    goLyrics(activeJobId);
    setPendingFile(null);
  }, [pendingFile, activeJobId, addJob, saveSegments, setSegments, goLyrics]);

  // 确认弹窗：新建任务
  const handleNewTask = useCallback(() => {
    if (!pendingFile) return;
    const file = pendingFile;
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job = {
      id: jobId,
      fileName: file.name,
      fileType: file.type || `${ext.includes('mp') && ext !== '.mp3' ? 'video' : 'audio'}/${ext.slice(1)}`,
      fileUrl: URL.createObjectURL(file),
      state: 'done' as const,
      progress: 100,
    };

    const newSegments = generateMockSegments(500);

    // 先保存当前歌词页状态
    if (activeJobId) {
      saveSegments(activeJobId, segments);
    }

    addJob(job);
    saveSegments(jobId, newSegments);
    setPendingFile(null);
    goHome();
  }, [pendingFile, activeJobId, segments, addJob, saveSegments, goHome]);

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

          <div>
            <h1 className="text-sm font-medium text-neutral-300">{activeJob?.fileName ?? '字幕复盘'}</h1>
            <p className="text-[11px] text-neutral-500">{segments.length} 条字幕 · 双击编辑 · 点击跳转播放</p>
          </div>
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <ExportMenu />
        </div>
      </header>

      {/* 歌词主体 */}
      <LyricsView />

      {/* 底部渐变遮罩 */}
      <div className="absolute bottom-[108px] left-0 right-0 h-24 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none z-10" />

      {/* 底部播放器 */}
      {activeJob && (
        <PlayerBar fileUrl={activeJob.fileUrl} fileType={activeJob.fileType} />
      )}

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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMediaImportWorkflow } from '../../hooks/useMediaImportWorkflow';
import { loadMediaFile } from '../../services/mediaDB';
import type { AsrProvider } from '../../services/transcription';
import { useProjectStore } from '../../stores/useProjectStore';
import { useSubtitleStore } from '../../stores/useSubtitleStore';
import { useWorkbenchStore } from '../../stores/useWorkbenchStore';
import type { Segment } from '../../types';
import { BottomStatusBar } from './BottomStatusBar';
import { MediaSidebar } from './MediaSidebar';
import { PlayerPanel } from './PlayerPanel';
import { RoughCutTimeline } from './RoughCutTimeline';
import { TopBar } from './TopBar';
import { TranscriptPanel } from './TranscriptPanel';
import { useWorkbenchHotkeys } from './useWorkbenchHotkeys';

export function RoughCutWorkbench() {
  const jobs = useProjectStore((state) => state.jobs);
  const activeJobId = useProjectStore((state) => state.activeJobId);
  const setActiveJob = useProjectStore((state) => state.setActiveJob);
  const saveSegments = useProjectStore((state) => state.saveSegments);
  const updateJobMedia = useProjectStore((state) => state.updateJobMedia);
  const segments = useSubtitleStore((state) => state.segments);
  const setSegments = useSubtitleStore((state) => state.setSegments);
  const updateStatus = useSubtitleStore((state) => state.updateStatus);
  const setSelectedMediaId = useWorkbenchStore((state) => state.setSelectedMediaId);
  const setSelectedSegmentId = useWorkbenchStore((state) => state.setSelectedSegmentId);
  const setLastActionMessage = useWorkbenchStore((state) => state.setLastActionMessage);
  const clearMediaSelectionState = useWorkbenchStore((state) => state.clearMediaSelectionState);
  const lastActionMessage = useWorkbenchStore((state) => state.lastActionMessage);

  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isGlobalDragOver, setIsGlobalDragOver] = useState(false);
  const loadedSegmentsRef = useRef<Segment[] | null>(null);
  const mediaRestoredRef = useRef(false);
  const asrProvider: AsrProvider = 'local';

  const { importFiles } = useMediaImportWorkflow(asrProvider);
  const activeJob = jobs.find((job) => job.id === activeJobId) ?? jobs[0];

  useWorkbenchHotkeys();

  const handleUndo = useCallback(() => {
    const action = useWorkbenchStore.getState().undoPendingAction();
    if (action?.type === 'cutRange' && action.item.segmentId && action.item.previousStatus) {
      updateStatus(action.item.segmentId, action.item.previousStatus);
    }
  }, [updateStatus]);

  const handleRedo = useCallback(() => {
    const action = useWorkbenchStore.getState().redoPendingAction();
    if (action?.type === 'cutRange' && action.item.segmentId) {
      updateStatus(action.item.segmentId, 'delete');
    }
  }, [updateStatus]);

  useEffect(() => {
    if (mediaRestoredRef.current) return;
    mediaRestoredRef.current = true;
    const currentJobs = useProjectStore.getState().jobs;
    currentJobs.forEach((job) => {
      if (job.mediaAvailable) return;
      void loadMediaFile(job.id)
        .then((media) => {
          if (media) {
            updateJobMedia(job.id, media.fileName || job.fileName, media.fileType || job.fileType, media.fileUrl);
          }
        })
        .catch(() => undefined);
    });
  }, [updateJobMedia]);

  useEffect(() => {
    if (!activeJobId && jobs.length > 0) {
      setActiveJob(jobs[0].id);
    }
  }, [activeJobId, jobs, setActiveJob]);

  useEffect(() => {
    clearMediaSelectionState();
    if (!activeJob?.id) {
      setSelectedMediaId(null);
      setSegments([]);
      loadedSegmentsRef.current = [];
      return;
    }

    setSelectedMediaId(activeJob.id);
    const storedSegments = useProjectStore.getState().segmentsMap[activeJob.id] ?? [];
    setSegments(storedSegments);
    loadedSegmentsRef.current = storedSegments;
    setSelectedSegmentId(null);
  }, [activeJob?.id, clearMediaSelectionState, setSegments, setSelectedMediaId, setSelectedSegmentId]);

  useEffect(() => {
    if (!activeJob?.id) return;
    if (segments === loadedSegmentsRef.current) return;
    saveSegments(activeJob.id, segments);
    setSavedAt(new Date());
  }, [activeJob?.id, saveSegments, segments]);

  const handleSelectJob = useCallback(
    (jobId: string) => {
      setActiveJob(jobId);
      const storedSegments = useProjectStore.getState().segmentsMap[jobId] ?? [];
      setSegments(storedSegments);
      loadedSegmentsRef.current = storedSegments;
      clearMediaSelectionState();
      setSelectedMediaId(jobId);
      setSelectedSegmentId(null);
      setLastActionMessage('已切换素材');
    },
    [clearMediaSelectionState, setActiveJob, setLastActionMessage, setSegments, setSelectedMediaId, setSelectedSegmentId]
  );

  const handleImportFiles = useCallback(
    (files: File[]) => {
      const summary = importFiles(files);
      if (summary.added > 0) {
        setLastActionMessage(`已导入 ${summary.added} 个素材`);
      } else if (summary.skipped > 0) {
        setLastActionMessage('没有找到支持的音视频文件');
      }
    },
    [importFiles, setLastActionMessage]
  );

  return (
    <div
      className="relative flex h-screen flex-col overflow-hidden bg-[#0a0a0a] text-neutral-100"
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setIsGlobalDragOver(true);
      }}
      onDragLeave={() => setIsGlobalDragOver(false)}
      onDrop={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setIsGlobalDragOver(false);
        handleImportFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <TopBar activeJob={activeJob} savedAt={savedAt} lastActionMessage={lastActionMessage} onUndo={handleUndo} onRedo={handleRedo} />

      <div className="flex min-h-0 flex-1">
        <MediaSidebar jobs={jobs} activeJobId={activeJob?.id ?? null} onSelectJob={handleSelectJob} onImportFiles={handleImportFiles} />

        <main className="flex min-w-0 flex-1 flex-col">
          <PlayerPanel activeJob={activeJob} segments={segments} />
          <RoughCutTimeline activeJob={activeJob} segments={segments} onImportFiles={handleImportFiles} />
        </main>

        <TranscriptPanel segments={segments} />
      </div>

      <BottomStatusBar lastActionMessage={lastActionMessage} />

      {isGlobalDragOver && (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 top-12 z-40 flex items-end justify-center bg-cyan-500/5 p-6">
          <div className="w-full max-w-5xl rounded-xl border-2 border-dashed border-cyan-400/50 bg-neutral-950/90 px-8 py-8 text-center text-cyan-100">
            拖拽音视频到时间线开始粗剪
          </div>
        </div>
      )}
    </div>
  );
}

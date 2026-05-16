import { useMemo, useRef } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useSubtitleStore } from '../../stores/useSubtitleStore';
import { useWorkbenchStore } from '../../stores/useWorkbenchStore';
import type { Job, Segment } from '../../types';
import { ImportTimelineDropZone } from './ImportTimelineDropZone';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTracks } from './TimelineTracks';
import { useTimelineZoom } from './useTimelineZoom';

interface RoughCutTimelineProps {
  activeJob: Job | undefined;
  segments: Segment[];
  onImportFiles: (files: File[]) => void;
}

function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

export function RoughCutTimeline({ activeJob, segments, onImportFiles }: RoughCutTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const playerDuration = usePlayerStore((state) => state.duration);
  const timelineZoom = useWorkbenchStore((state) => state.timelineZoom);
  const setTimelineZoom = useWorkbenchStore((state) => state.setTimelineZoom);
  const playheadDisplayTime = useWorkbenchStore((state) => state.playheadDisplayTime);
  const setPlayheadDisplayTime = useWorkbenchStore((state) => state.setPlayheadDisplayTime);
  const currentTool = useWorkbenchStore((state) => state.currentTool);
  const setCurrentTool = useWorkbenchStore((state) => state.setCurrentTool);
  const selectedSegmentId = useWorkbenchStore((state) => state.selectedSegmentId);
  const addPendingCutPoint = useWorkbenchStore((state) => state.addPendingCutPoint);
  const addPendingCutRange = useWorkbenchStore((state) => state.addPendingCutRange);
  const setLastActionMessage = useWorkbenchStore((state) => state.setLastActionMessage);
  const updateStatus = useSubtitleStore((state) => state.updateStatus);

  useTimelineZoom(scrollRef);

  const duration = Math.max(1, activeJob?.durationSeconds || playerDuration || 60);
  const trackWidth = useMemo(() => Math.max(1120, Math.ceil(duration * 3.2 * timelineZoom)), [duration, timelineZoom]);

  const handleDeleteSelected = () => {
    const selectedSegment = segments.find((segment) => segment.id === selectedSegmentId);
    if (!selectedSegment) {
      const start = playheadDisplayTime;
      addPendingCutRange({ start, end: start + 2, source: 'manual' });
      return;
    }
    addPendingCutRange({
      start: selectedSegment.start,
      end: selectedSegment.end,
      source: 'segment',
      segmentId: selectedSegment.id,
      previousStatus: selectedSegment.status,
    });
    updateStatus(selectedSegment.id, 'delete');
  };

  return (
    <section
      className="flex min-h-[280px] shrink-0 flex-col border-t border-neutral-800 bg-[#0b0b0b]"
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer.files.length > 0) {
          onImportFiles(Array.from(event.dataTransfer.files));
        }
      }}
    >
      <div className="flex h-11 items-center justify-between border-b border-neutral-800 px-4">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-neutral-200">粗剪时间线</div>
          <button
            type="button"
            className={`rounded px-2 py-1 text-xs ${
              currentTool === 'select' ? 'bg-neutral-700 text-neutral-100' : 'text-neutral-500 hover:bg-neutral-800'
            }`}
            onClick={() => setCurrentTool('select')}
          >
            选择
          </button>
          <button
            type="button"
            className={`rounded px-2 py-1 text-xs ${
              currentTool === 'blade' ? 'bg-amber-500/20 text-amber-200' : 'text-neutral-500 hover:bg-neutral-800'
            }`}
            onClick={() => setCurrentTool('blade')}
          >
            切割
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-neutral-500 hover:bg-red-500/10 hover:text-red-200"
            onClick={handleDeleteSelected}
          >
            删除
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>缩放 {formatZoom(timelineZoom)}</span>
          <button
            type="button"
            className="rounded-md bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
            onClick={() => setTimelineZoom(timelineZoom - 0.25)}
          >
            -
          </button>
          <input
            type="range"
            min={0.5}
            max={8}
            step={0.1}
            value={timelineZoom}
            onChange={(event) => setTimelineZoom(Number(event.target.value))}
            className="h-1 w-28 cursor-pointer appearance-none rounded-full bg-neutral-700"
          />
          <button
            type="button"
            className="rounded-md bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
            onClick={() => setTimelineZoom(timelineZoom + 0.25)}
          >
            +
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-3">
        {!activeJob ? (
          <ImportTimelineDropZone onImportFiles={onImportFiles} />
        ) : (
          <div ref={scrollRef} className="h-full overflow-auto rounded-lg border border-neutral-800 bg-neutral-950">
            <div
              className="relative min-h-full"
              style={{ width: trackWidth }}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
                const nextTime = ratio * duration;

                if (currentTool === 'blade') {
                  addPendingCutPoint(nextTime);
                  return;
                }

                usePlayerStore.getState().seekTo(nextTime);
                setPlayheadDisplayTime(nextTime);
                setLastActionMessage(`播放头 ${nextTime.toFixed(2)}s`);
              }}
            >
              <TimelineRuler duration={duration} trackWidth={trackWidth} />
              <TimelineTracks activeJob={activeJob} segments={segments} duration={duration} trackWidth={trackWidth} />
              <TimelinePlayhead time={playheadDisplayTime} duration={duration} trackWidth={trackWidth} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

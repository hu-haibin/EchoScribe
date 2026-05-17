import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useWorkbenchStore } from '../../stores/useWorkbenchStore';
import type { Job, Segment } from '../../types';
import { ImportTimelineDropZone } from './ImportTimelineDropZone';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTracks } from './TimelineTracks';
import { useTimelineViewport } from './useTimelineViewport';
import type { PlaybackController } from './usePlaybackController';
import type { Boundary } from './useTimelineBoundaries';

interface RoughCutTimelineProps {
  activeJob: Job | undefined;
  segments: Segment[];
  boundaries: Boundary[];
  controller: PlaybackController;
  onImportFiles: (files: File[]) => void;
}

interface RangeInteraction {
  pointerId: number;
  startClientX: number;
  startTime: number;
  moved: boolean;
}

function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

function formatHoverTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = Math.floor(safe % 60);
  const frame = Math.floor((safe % 1) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}.${frame}`;
}

export function RoughCutTimeline({ activeJob, segments, boundaries, controller, onImportFiles }: RoughCutTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const hoverLineRef = useRef<HTMLDivElement>(null);
  const hoverLabelRef = useRef<HTMLDivElement>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const latestHoverRef = useRef<{ clientX: number; time: number } | null>(null);
  const rangeInteractionRef = useRef<RangeInteraction | null>(null);
  const isScrubbingRef = useRef(false);
  const userScrollHoldUntilRef = useRef(0);

  const playerDuration = usePlayerStore((state) => state.duration);
  const setTimelineZoom = useWorkbenchStore((state) => state.setTimelineZoom);
  const followPlayhead = useWorkbenchStore((state) => state.followPlayhead);
  const currentTool = useWorkbenchStore((state) => state.currentTool);
  const setCurrentTool = useWorkbenchStore((state) => state.setCurrentTool);
  const selectedSegmentId = useWorkbenchStore((state) => state.selectedSegmentId);
  const activeSegmentId = useWorkbenchStore((state) => state.activeSegmentId);
  const selectedRange = useWorkbenchStore((state) => state.selectedRange);
  const setSelectedRange = useWorkbenchStore((state) => state.setSelectedRange);
  const addCutPoint = useWorkbenchStore((state) => state.addCutPoint);
  const addCutRange = useWorkbenchStore((state) => state.addCutRange);
  const setLastActionMessage = useWorkbenchStore((state) => state.setLastActionMessage);

  const duration = Math.max(1, activeJob?.durationSeconds || playerDuration || 60);
  const viewport = useTimelineViewport(scrollRef, duration);

  const mediaId = activeJob?.id ?? null;
  const selectedSegment = useMemo(
    () => segments.find((segment) => segment.id === selectedSegmentId) ?? null,
    [segments, selectedSegmentId]
  );
  const activeSegment = useMemo(
    () => segments.find((segment) => segment.id === activeSegmentId) ?? null,
    [activeSegmentId, segments]
  );

  useEffect(() => {
    return controller.subscribeFrame((time) => {
      if (playheadRef.current) {
        playheadRef.current.style.transform = `translateX(${viewport.timeToX(time)}px)`;
      }
      if (followPlayhead && !isScrubbingRef.current && performance.now() > userScrollHoldUntilRef.current) {
        viewport.ensurePlayheadVisible(time);
      }
    });
  }, [controller, followPlayhead, viewport]);

  const updateHoverPreview = useCallback(
    (clientX: number) => {
      const time = viewport.clientXToTime(clientX);
      latestHoverRef.current = { clientX, time };
      if (hoverFrameRef.current !== null) return;
      hoverFrameRef.current = requestAnimationFrame(() => {
        hoverFrameRef.current = null;
        const latest = latestHoverRef.current;
        if (!latest || !hoverLineRef.current || !hoverLabelRef.current) return;
        const x = viewport.timeToX(latest.time);
        hoverLineRef.current.style.display = 'block';
        hoverLineRef.current.style.transform = `translateX(${x}px)`;
        hoverLabelRef.current.style.display = 'block';
        hoverLabelRef.current.style.transform = `translateX(${Math.max(0, x - 28)}px)`;
        hoverLabelRef.current.textContent = formatHoverTime(latest.time);
      });
    },
    [viewport]
  );

  const hideHoverPreview = useCallback(() => {
    latestHoverRef.current = null;
    if (hoverFrameRef.current !== null) {
      cancelAnimationFrame(hoverFrameRef.current);
      hoverFrameRef.current = null;
    }
    if (hoverLineRef.current) hoverLineRef.current.style.display = 'none';
    if (hoverLabelRef.current) hoverLabelRef.current.style.display = 'none';
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (!mediaId) return;

    if (selectedRange && selectedRange.sourceEnd - selectedRange.sourceStart > 0.03) {
      addCutRange({
        mediaId,
        sourceStart: selectedRange.sourceStart,
        sourceEnd: selectedRange.sourceEnd,
        reason: 'manual-delete',
      });
      return;
    }

    const segment = selectedSegment ?? activeSegment;
    if (!segment) {
      setLastActionMessage('没有选中的段落或时间区间');
      return;
    }

    addCutRange({
      mediaId,
      sourceStart: segment.start,
      sourceEnd: segment.end,
      reason: 'segment-delete',
      segmentIds: [segment.id],
    });
  }, [activeSegment, addCutRange, mediaId, selectedRange, selectedSegment, setLastActionMessage]);

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        viewport.zoomAtPoint(event.deltaY, event.clientX);
        return;
      }

      if (event.shiftKey && scrollRef.current) {
        event.preventDefault();
        scrollRef.current.scrollLeft += event.deltaY;
      }
    },
    [viewport]
  );

  const handleContentPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!activeJob || event.button !== 0) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('[data-timeline-interactive="true"]')) return;

      const sourceTime = viewport.clientXToTime(event.clientX);
      if (currentTool === 'blade') {
        if (mediaId) {
          addCutPoint({ mediaId, sourceTime });
        }
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      rangeInteractionRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startTime: sourceTime,
        moved: false,
      };
      setSelectedRange(null);
    },
    [activeJob, addCutPoint, currentTool, mediaId, setSelectedRange, viewport]
  );

  const handleContentPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      updateHoverPreview(event.clientX);
      const interaction = rangeInteractionRef.current;
      if (!interaction || interaction.pointerId !== event.pointerId) return;

      const moved = Math.abs(event.clientX - interaction.startClientX) > 4;
      if (!moved && !interaction.moved) return;

      interaction.moved = true;
      const currentTime = viewport.clientXToTime(event.clientX);
      setSelectedRange({
        sourceStart: Math.min(interaction.startTime, currentTime),
        sourceEnd: Math.max(interaction.startTime, currentTime),
      });
    },
    [setSelectedRange, updateHoverPreview, viewport]
  );

  const handleContentPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const interaction = rangeInteractionRef.current;
      if (!interaction || interaction.pointerId !== event.pointerId) return;

      event.currentTarget.releasePointerCapture(event.pointerId);
      rangeInteractionRef.current = null;
      userScrollHoldUntilRef.current = performance.now() + 900;

      if (interaction.moved) {
        setLastActionMessage('已选择时间区间，按 Delete 标记删除');
        return;
      }

      const nextTime = interaction.startTime;
      setSelectedRange(null);
      controller.seekTo(nextTime, { forceDisplay: true });
      viewport.ensurePlayheadVisible(nextTime);
      setLastActionMessage(`播放头 ${nextTime.toFixed(2)}s`);
    },
    [controller, setLastActionMessage, setSelectedRange, viewport]
  );

  const handlePlayheadPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const wasPlaying = controller.isPlayingRef.current;
      let latestClientX = event.clientX;
      let frameId: number | null = null;

      isScrubbingRef.current = true;
      if (wasPlaying) controller.pause();

      const applyScrub = (force = false) => {
        if (frameId !== null && !force) return;
        frameId = requestAnimationFrame(() => {
          frameId = null;
          controller.scrubTo(viewport.clientXToTime(latestClientX));
        });
      };

      const handleMove = (moveEvent: PointerEvent) => {
        latestClientX = moveEvent.clientX;
        applyScrub();
      };

      const finish = () => {
        if (frameId !== null) {
          cancelAnimationFrame(frameId);
          frameId = null;
        }
        controller.seekTo(viewport.clientXToTime(latestClientX), { forceDisplay: true });
        isScrubbingRef.current = false;
        userScrollHoldUntilRef.current = performance.now() + 900;
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        if (wasPlaying) controller.play();
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
      applyScrub(true);
    },
    [controller, viewport]
  );

  useEffect(() => {
    if (followPlayhead) {
      viewport.ensurePlayheadVisible(controller.getCurrentTime());
    }
  }, [controller, followPlayhead, viewport]);

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
          <span>缩放 {formatZoom(viewport.zoom)}</span>
          <button
            type="button"
            className="rounded-md bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
            onClick={() => setTimelineZoom(viewport.zoom - 0.25)}
          >
            -
          </button>
          <input
            type="range"
            min={0.5}
            max={8}
            step={0.1}
            value={viewport.zoom}
            onChange={(event) => setTimelineZoom(Number(event.target.value))}
            className="h-1 w-28 cursor-pointer appearance-none rounded-full bg-neutral-700"
          />
          <button
            type="button"
            className="rounded-md bg-neutral-800 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-700"
            onClick={() => setTimelineZoom(viewport.zoom + 0.25)}
          >
            +
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-3">
        {!activeJob ? (
          <ImportTimelineDropZone onImportFiles={onImportFiles} />
        ) : (
          <div
            ref={scrollRef}
            className="h-full overflow-auto rounded-lg border border-neutral-800 bg-neutral-950"
            onWheel={handleWheel}
          >
            <div
              className="relative min-h-full select-none"
              style={{ width: viewport.contentWidth }}
              onPointerDown={handleContentPointerDown}
              onPointerMove={handleContentPointerMove}
              onPointerUp={handleContentPointerUp}
              onPointerCancel={() => {
                rangeInteractionRef.current = null;
              }}
              onPointerLeave={hideHoverPreview}
            >
              <TimelineRuler duration={duration} trackWidth={viewport.contentWidth} />
              <TimelineTracks
                activeJob={activeJob}
                segments={segments}
                boundaries={boundaries}
                duration={duration}
                trackWidth={viewport.contentWidth}
                scrollLeft={viewport.scrollLeft}
                containerWidth={viewport.containerWidth}
                pxPerSecond={viewport.pxPerSecond}
              />
              <div
                ref={hoverLineRef}
                className="pointer-events-none absolute bottom-0 top-0 z-20 hidden w-px bg-white/35"
              />
              <div
                ref={hoverLabelRef}
                className="pointer-events-none absolute top-1 z-30 hidden rounded bg-neutral-900/95 px-1.5 py-0.5 font-mono text-[10px] text-neutral-100 shadow"
              />
              <TimelinePlayhead
                ref={playheadRef}
                x={viewport.timeToX(controller.getCurrentTime())}
                onPointerDown={handlePlayheadPointerDown}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

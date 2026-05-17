import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSubtitleStore } from '../../stores/useSubtitleStore';
import { useWorkbenchStore, type CutRange } from '../../stores/useWorkbenchStore';
import type { Segment, SegmentStatus } from '../../types';
import type { PlaybackController } from './usePlaybackController';
import { segmentStartBoundaryId } from './useTimelineBoundaries';

interface TranscriptPanelProps {
  segments: Segment[];
  controller: PlaybackController;
}

interface TranscriptRowProps {
  segment: Segment;
  isActive: boolean;
  isSelected: boolean;
  isDeleted: boolean;
  onSelect: (segment: Segment) => void;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const rest = Math.floor(safe % 60);
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function segmentIsDeleted(segment: Segment, ranges: CutRange[], mediaId: string | null): boolean {
  if (segment.status === 'delete') return true;
  return ranges.some((range) => {
    if (range.mediaId !== mediaId) return false;
    if (range.segmentIds?.includes(segment.id)) return true;
    return range.sourceStart <= segment.start && range.sourceEnd >= segment.end;
  });
}

function statusText(status: SegmentStatus, isDeleted: boolean): string {
  if (isDeleted) return '删除';
  if (status === 'keep') return '保留';
  return '待审';
}

const TranscriptRow = memo(function TranscriptRow({
  segment,
  isActive,
  isSelected,
  isDeleted,
  onSelect,
}: TranscriptRowProps) {
  const updateText = useSubtitleStore((state) => state.updateText);
  const [draft, setDraft] = useState(segment.edited_text || segment.raw_text);

  useEffect(() => {
    setDraft(segment.edited_text || segment.raw_text);
  }, [segment.edited_text, segment.raw_text]);

  const commitText = () => {
    const next = draft.trim();
    if (next && next !== segment.edited_text) {
      updateText(segment.id, next);
    }
  };

  return (
    <div
      className={`rounded-lg border px-3 py-2 transition-colors ${
        isActive
          ? 'border-cyan-300/50 bg-cyan-400/10'
          : isSelected
            ? 'border-amber-300/50 bg-amber-300/10'
            : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
      } ${isDeleted ? 'opacity-60' : ''}`}
      onClick={() => onSelect(segment)}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tabular-nums text-neutral-500">
          {formatTime(segment.start)} - {formatTime(segment.end)}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] ${
            isDeleted
              ? 'bg-red-500/15 text-red-300'
              : segment.status === 'keep'
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-amber-500/15 text-amber-200'
          }`}
        >
          {statusText(segment.status, isDeleted)}
        </span>
      </div>
      <textarea
        value={draft}
        rows={2}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitText}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(segment);
        }}
        className={`block w-full resize-none bg-transparent text-sm leading-relaxed outline-none ${
          isDeleted ? 'text-neutral-500 line-through' : 'text-neutral-200'
        }`}
      />
    </div>
  );
});

export function TranscriptPanel({ segments, controller }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedMediaId = useWorkbenchStore((state) => state.selectedMediaId);
  const selectedSegmentId = useWorkbenchStore((state) => state.selectedSegmentId);
  const activeSegmentId = useWorkbenchStore((state) => state.activeSegmentId);
  const cutRanges = useWorkbenchStore((state) => state.cutRanges);
  const setSelectedSegmentId = useWorkbenchStore((state) => state.setSelectedSegmentId);
  const setActiveSegmentId = useWorkbenchStore((state) => state.setActiveSegmentId);
  const setActiveBoundaryId = useWorkbenchStore((state) => state.setActiveBoundaryId);
  const setSelectedRange = useWorkbenchStore((state) => state.setSelectedRange);
  const setLastActionMessage = useWorkbenchStore((state) => state.setLastActionMessage);

  const activeIndex = useMemo(
    () => (activeSegmentId ? segments.findIndex((segment) => segment.id === activeSegmentId) : -1),
    [activeSegmentId, segments]
  );

  const rowVirtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 86,
    overscan: 8,
    getItemKey: (index) => segments[index]?.id ?? index,
  });

  useEffect(() => {
    if (activeIndex < 0) return;
    rowVirtualizer.scrollToIndex(activeIndex, { align: 'center' });
  }, [activeIndex, rowVirtualizer]);

  const handleSelect = (segment: Segment) => {
    setSelectedRange(null);
    setSelectedSegmentId(segment.id);
    setActiveSegmentId(segment.id);
    if (selectedMediaId) {
      setActiveBoundaryId(segmentStartBoundaryId(selectedMediaId, segment.id));
    }
    controller.seekTo(segment.start, { forceDisplay: true });
    setLastActionMessage('已跳转到文稿段落');
  };

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-neutral-800 bg-[#101010]">
      <div className="flex h-12 items-center justify-between border-b border-neutral-800 px-4">
        <div>
          <div className="text-sm font-semibold text-neutral-200">文稿 / 片段</div>
          <div className="text-[11px] text-neutral-500">{segments.length} 个段落</div>
        </div>
      </div>

      {segments.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center text-sm text-neutral-500">
          识别后将在这里显示文稿
        </div>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-3">
          <div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const segment = segments[virtualRow.index];
              if (!segment) return null;
              const isActive = segment.id === activeSegmentId;
              const isSelected = segment.id === selectedSegmentId;
              const isDeleted = segmentIsDeleted(segment, cutRanges, selectedMediaId);

              return (
                <div
                  key={segment.id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute left-0 right-0 pb-2"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <TranscriptRow
                    segment={segment}
                    isActive={isActive}
                    isSelected={isSelected}
                    isDeleted={isDeleted}
                    onSelect={handleSelect}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}

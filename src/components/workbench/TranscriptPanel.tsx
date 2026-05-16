import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useSubtitleStore } from '../../stores/useSubtitleStore';
import { useWorkbenchStore } from '../../stores/useWorkbenchStore';
import type { Segment, SegmentStatus } from '../../types';

interface TranscriptPanelProps {
  segments: Segment[];
}

interface TranscriptRowProps {
  segment: Segment;
  isActive: boolean;
  isSelected: boolean;
  isPendingDelete: boolean;
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

function findActiveSegmentIndex(segments: Segment[], time: number): number {
  if (segments.length === 0) return -1;
  let lo = 0;
  let hi = segments.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (segments[mid].start <= time) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (result >= 0 && time <= segments[result].end) return result;
  return result;
}

function statusText(status: SegmentStatus, isPendingDelete: boolean): string {
  if (status === 'delete' || isPendingDelete) return '删除';
  if (status === 'keep') return '保留';
  return '待审';
}

const TranscriptRow = memo(function TranscriptRow({
  segment,
  isActive,
  isSelected,
  isPendingDelete,
  onSelect,
}: TranscriptRowProps) {
  const updateText = useSubtitleStore((state) => state.updateText);
  const [draft, setDraft] = useState(segment.edited_text || segment.raw_text);
  const deleted = segment.status === 'delete' || isPendingDelete;

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
      } ${deleted ? 'opacity-60' : ''}`}
      onClick={() => onSelect(segment)}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] tabular-nums text-neutral-500">
          {formatTime(segment.start)} - {formatTime(segment.end)}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] ${
            deleted
              ? 'bg-red-500/15 text-red-300'
              : segment.status === 'keep'
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-amber-500/15 text-amber-200'
          }`}
        >
          {statusText(segment.status, isPendingDelete)}
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
          deleted ? 'text-neutral-500 line-through' : 'text-neutral-200'
        }`}
      />
    </div>
  );
});

export function TranscriptPanel({ segments }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedSegmentId = useWorkbenchStore((state) => state.selectedSegmentId);
  const activeSegmentId = useWorkbenchStore((state) => state.activeSegmentId);
  const playheadDisplayTime = useWorkbenchStore((state) => state.playheadDisplayTime);
  const followPlayhead = useWorkbenchStore((state) => state.followPlayhead);
  const pendingCutRanges = useWorkbenchStore((state) => state.pendingCutRanges);
  const setSelectedSegmentId = useWorkbenchStore((state) => state.setSelectedSegmentId);
  const setActiveSegmentId = useWorkbenchStore((state) => state.setActiveSegmentId);
  const setPlayheadDisplayTime = useWorkbenchStore((state) => state.setPlayheadDisplayTime);
  const setLastActionMessage = useWorkbenchStore((state) => state.setLastActionMessage);

  const activeIndex = useMemo(
    () => findActiveSegmentIndex(segments, playheadDisplayTime),
    [segments, playheadDisplayTime]
  );

  const pendingDeletedSegmentIds = useMemo(() => {
    const ids = new Set<string>();
    pendingCutRanges.forEach((range) => {
      if (range.segmentId) ids.add(range.segmentId);
    });
    return ids;
  }, [pendingCutRanges]);

  const rowVirtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 86,
    overscan: 8,
    getItemKey: (index) => segments[index]?.id ?? index,
  });

  useEffect(() => {
    const nextId = activeIndex >= 0 ? segments[activeIndex]?.id ?? null : null;
    if (nextId !== activeSegmentId) {
      setActiveSegmentId(nextId);
    }
  }, [activeIndex, activeSegmentId, segments, setActiveSegmentId]);

  useEffect(() => {
    if (!followPlayhead || activeIndex < 0) return;
    rowVirtualizer.scrollToIndex(activeIndex, { align: 'center' });
  }, [activeIndex, followPlayhead, rowVirtualizer]);

  const handleSelect = (segment: Segment) => {
    setSelectedSegmentId(segment.id);
    setPlayheadDisplayTime(segment.start);
    usePlayerStore.getState().seekTo(segment.start);
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
              const isPendingDelete = pendingDeletedSegmentIds.has(segment.id);

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
                    isPendingDelete={isPendingDelete}
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

import { memo, useMemo } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useWorkbenchStore } from '../../stores/useWorkbenchStore';
import type { Segment } from '../../types';

interface SegmentMarkerTrackProps {
  segments: Segment[];
  duration: number;
}

function rangeStyle(start: number, end: number, duration: number) {
  const safeDuration = Math.max(1, duration);
  return {
    left: `${(Math.max(0, start) / safeDuration) * 100}%`,
    width: `${(Math.max(0.08, end - start) / safeDuration) * 100}%`,
  };
}

export const SegmentMarkerTrack = memo(function SegmentMarkerTrack({ segments, duration }: SegmentMarkerTrackProps) {
  const selectedSegmentId = useWorkbenchStore((state) => state.selectedSegmentId);
  const activeSegmentId = useWorkbenchStore((state) => state.activeSegmentId);
  const pendingCutRanges = useWorkbenchStore((state) => state.pendingCutRanges);
  const setSelectedSegmentId = useWorkbenchStore((state) => state.setSelectedSegmentId);
  const setPlayheadDisplayTime = useWorkbenchStore((state) => state.setPlayheadDisplayTime);
  const setLastActionMessage = useWorkbenchStore((state) => state.setLastActionMessage);

  const pendingDeletedSegmentIds = useMemo(() => {
    const ids = new Set<string>();
    pendingCutRanges.forEach((range) => {
      if (range.segmentId) ids.add(range.segmentId);
    });
    return ids;
  }, [pendingCutRanges]);

  const visibleSegments = useMemo(() => {
    const maxMarkers = 240;
    const step = Math.max(1, Math.ceil(segments.length / maxMarkers));
    return segments.filter((segment, index) => {
      return index % step === 0 || segment.id === selectedSegmentId || segment.id === activeSegmentId;
    });
  }, [activeSegmentId, segments, selectedSegmentId]);

  return (
    <div className="relative h-12 border-b border-neutral-800 bg-neutral-900/50">
      <div className="absolute left-3 top-2 text-[11px] font-medium text-neutral-500">文稿</div>
      {visibleSegments.map((segment) => {
        const deleted = segment.status === 'delete' || pendingDeletedSegmentIds.has(segment.id);
        const active = segment.id === activeSegmentId;
        const selected = segment.id === selectedSegmentId;
        return (
          <button
            key={segment.id}
            type="button"
            title={segment.edited_text || segment.raw_text}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedSegmentId(segment.id);
              setPlayheadDisplayTime(segment.start);
              usePlayerStore.getState().seekTo(segment.start);
              setLastActionMessage('已跳转到文稿段落');
            }}
            className={`absolute bottom-2 top-2 rounded-sm border px-1 text-left text-[10px] transition-colors ${
              active
                ? 'border-cyan-300 bg-cyan-400/30 text-cyan-50'
                : selected
                  ? 'border-amber-300 bg-amber-300/25 text-amber-100'
                  : deleted
                    ? 'border-red-400/30 bg-red-500/20 text-red-200'
                    : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-500'
            }`}
            style={rangeStyle(segment.start, segment.end, duration)}
          >
            <span className={`block truncate ${deleted ? 'line-through' : ''}`}>
              {segment.edited_text || segment.raw_text}
            </span>
          </button>
        );
      })}
    </div>
  );
});

import { memo, useMemo } from 'react';
import { useWorkbenchStore } from '../../stores/useWorkbenchStore';
import type { Segment } from '../../types';

interface CutRangeTrackProps {
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

export const CutRangeTrack = memo(function CutRangeTrack({ segments, duration }: CutRangeTrackProps) {
  const selectedMediaId = useWorkbenchStore((state) => state.selectedMediaId);
  const selectedCutRangeId = useWorkbenchStore((state) => state.selectedCutRangeId);
  const selectedRange = useWorkbenchStore((state) => state.selectedRange);
  const cutRanges = useWorkbenchStore((state) => state.cutRanges);
  const setSelectedCutRangeId = useWorkbenchStore((state) => state.setSelectedCutRangeId);
  const setSelectedRange = useWorkbenchStore((state) => state.setSelectedRange);

  const mediaCutRanges = useMemo(
    () => cutRanges.filter((range) => range.mediaId === selectedMediaId),
    [cutRanges, selectedMediaId]
  );
  const legacyDeletedSegments = useMemo(
    () => segments.filter((segment) => segment.status === 'delete').slice(0, 240),
    [segments]
  );

  return (
    <div className="relative h-12 bg-neutral-950">
      <div className="absolute left-3 top-2 text-[11px] font-medium text-red-200/70">删除</div>
      {legacyDeletedSegments.map((segment) => (
        <div
          key={segment.id}
          className="absolute bottom-2 top-2 rounded-sm bg-red-500/20"
          style={rangeStyle(segment.start, segment.end, duration)}
        />
      ))}
      {selectedRange && selectedRange.sourceEnd - selectedRange.sourceStart > 0.03 && (
        <div
          className="absolute bottom-2 top-2 rounded-sm border border-amber-300/70 bg-amber-300/15"
          style={rangeStyle(selectedRange.sourceStart, selectedRange.sourceEnd, duration)}
        />
      )}
      {mediaCutRanges.map((range) => (
        <button
          key={range.id}
          type="button"
          data-timeline-interactive="true"
          className={`absolute bottom-2 top-2 rounded-sm border ${
            range.id === selectedCutRangeId
              ? 'border-red-200 bg-red-500/35'
              : 'border-red-400/60 bg-red-500/25 hover:bg-red-500/35'
          }`}
          style={rangeStyle(range.sourceStart, range.sourceEnd, duration)}
          title={`${range.sourceStart.toFixed(2)}s - ${range.sourceEnd.toFixed(2)}s`}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedRange(null);
            setSelectedCutRangeId(range.id);
          }}
        />
      ))}
    </div>
  );
});

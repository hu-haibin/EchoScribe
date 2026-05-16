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
  const pendingCutRanges = useWorkbenchStore((state) => state.pendingCutRanges);
  const pendingCutPoints = useWorkbenchStore((state) => state.pendingCutPoints);

  const deletedSegments = useMemo(
    () => segments.filter((segment) => segment.status === 'delete').slice(0, 240),
    [segments]
  );

  return (
    <div className="relative h-12 bg-neutral-950">
      <div className="absolute left-3 top-2 text-[11px] font-medium text-red-200/70">删除</div>
      {deletedSegments.map((segment) => (
        <div
          key={segment.id}
          className="absolute bottom-2 top-2 rounded-sm bg-red-500/25"
          style={rangeStyle(segment.start, segment.end, duration)}
        />
      ))}
      {pendingCutRanges.map((range) => (
        <div
          key={range.id}
          className="absolute bottom-2 top-2 rounded-sm border border-red-400/60 bg-red-500/25"
          style={rangeStyle(range.start, range.end, duration)}
          title={`${range.start.toFixed(2)}s - ${range.end.toFixed(2)}s`}
        />
      ))}
      {pendingCutPoints.map((cut) => (
        <div
          key={cut.id}
          className="absolute bottom-1 top-1 w-px bg-amber-300 shadow-[0_0_6px_rgba(251,191,36,0.75)]"
          style={{ left: `${(cut.time / Math.max(1, duration)) * 100}%` }}
          title={`切点 ${cut.time.toFixed(2)}s`}
        />
      ))}
    </div>
  );
});

import { memo } from 'react';
import { useWorkbenchStore } from '../../stores/useWorkbenchStore';
import type { Job, Segment } from '../../types';
import { BoundaryCanvasTrack } from './BoundaryCanvasTrack';
import { CutRangeTrack } from './CutRangeTrack';
import { WaveformTrack } from './WaveformTrack';
import type { Boundary } from './useTimelineBoundaries';

interface TimelineTracksProps {
  activeJob: Job;
  segments: Segment[];
  boundaries: Boundary[];
  duration: number;
  trackWidth: number;
  scrollLeft: number;
  containerWidth: number;
  pxPerSecond: number;
}

export const TimelineTracks = memo(function TimelineTracks({
  activeJob,
  segments,
  boundaries,
  duration,
  trackWidth,
  scrollLeft,
  containerWidth,
  pxPerSecond,
}: TimelineTracksProps) {
  const activeBoundaryId = useWorkbenchStore((state) => state.activeBoundaryId);
  const selectedSegmentId = useWorkbenchStore((state) => state.selectedSegmentId);

  return (
    <div className="relative" style={{ width: trackWidth }}>
      <div className="relative h-10 border-b border-neutral-800 bg-neutral-900/70">
        <div className="absolute left-3 top-2 text-[11px] font-medium text-blue-200/70">视频</div>
        <div className="absolute bottom-2 left-14 right-3 top-2 rounded border border-blue-400/30 bg-blue-500/20">
          <div className="flex h-full items-center px-3 text-xs text-blue-100">
            <span className="truncate">{activeJob.fileName}</span>
          </div>
        </div>
      </div>

      <WaveformTrack trackWidth={trackWidth} />
      <BoundaryCanvasTrack
        boundaries={boundaries}
        duration={duration}
        trackWidth={trackWidth}
        scrollLeft={scrollLeft}
        containerWidth={containerWidth}
        pxPerSecond={pxPerSecond}
        activeBoundaryId={activeBoundaryId}
        selectedSegmentId={selectedSegmentId}
      />
      <CutRangeTrack segments={segments} duration={duration} />
    </div>
  );
});

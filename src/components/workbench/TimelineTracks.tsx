import { memo } from 'react';
import type { Job, Segment } from '../../types';
import { CutRangeTrack } from './CutRangeTrack';
import { SegmentMarkerTrack } from './SegmentMarkerTrack';
import { WaveformTrack } from './WaveformTrack';

interface TimelineTracksProps {
  activeJob: Job;
  segments: Segment[];
  duration: number;
  trackWidth: number;
}

export const TimelineTracks = memo(function TimelineTracks({
  activeJob,
  segments,
  duration,
  trackWidth,
}: TimelineTracksProps) {
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
      <SegmentMarkerTrack segments={segments} duration={duration} />
      <CutRangeTrack segments={segments} duration={duration} />
    </div>
  );
});

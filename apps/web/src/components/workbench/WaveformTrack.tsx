import { memo, useMemo } from 'react';

interface WaveformTrackProps {
  trackWidth: number;
}

export const WaveformTrack = memo(function WaveformTrack({ trackWidth }: WaveformTrackProps) {
  const bars = useMemo(() => {
    const count = Math.max(64, Math.min(260, Math.floor(trackWidth / 9)));
    return Array.from({ length: count }, (_, index) => {
      const primary = Math.sin(index * 0.42) * 0.5 + 0.5;
      const secondary = ((index * 37) % 53) / 53;
      const height = 18 + Math.round((primary * 0.55 + secondary * 0.45) * 62);
      return { id: index, height };
    });
  }, [trackWidth]);

  return (
    <div className="relative h-20 border-b border-neutral-800 bg-neutral-950">
      <div className="absolute left-3 top-2 text-[11px] font-medium text-cyan-200/70">波形</div>
      <div className="absolute bottom-3 left-3 right-3 top-7 flex items-center gap-px overflow-hidden rounded bg-cyan-400/10 px-1">
        {bars.map((bar) => (
          <div
            key={bar.id}
            className="w-1 shrink-0 rounded-full bg-cyan-300/55"
            style={{ height: `${bar.height}%` }}
          />
        ))}
      </div>
    </div>
  );
});

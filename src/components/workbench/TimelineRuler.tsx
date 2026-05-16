import { useMemo } from 'react';

interface TimelineRulerProps {
  duration: number;
  trackWidth: number;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function niceStep(rawStep: number): number {
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  return steps.find((step) => step >= rawStep) ?? 600;
}

export function TimelineRuler({ duration, trackWidth }: TimelineRulerProps) {
  const ticks = useMemo(() => {
    const safeDuration = Math.max(1, duration);
    const targetTicks = Math.max(8, Math.min(80, Math.floor(trackWidth / 110)));
    const step = niceStep(safeDuration / targetTicks);
    const nextTicks: number[] = [];
    for (let time = 0; time <= safeDuration; time += step) {
      nextTicks.push(time);
    }
    if (nextTicks[nextTicks.length - 1] !== safeDuration) {
      nextTicks.push(safeDuration);
    }
    return nextTicks;
  }, [duration, trackWidth]);

  return (
    <div className="relative h-8 border-b border-neutral-800 text-[11px] text-neutral-500" style={{ width: trackWidth }}>
      {ticks.map((time) => (
        <div
          key={time}
          className="absolute top-0 h-full border-l border-neutral-700 pl-1"
          style={{ left: `${(time / Math.max(1, duration)) * trackWidth}px` }}
        >
          {formatTime(time)}
        </div>
      ))}
    </div>
  );
}

interface TimelinePlayheadProps {
  time: number;
  duration: number;
  trackWidth: number;
}

export function TimelinePlayhead({ time, duration, trackWidth }: TimelinePlayheadProps) {
  const left = duration > 0 ? Math.min(trackWidth, Math.max(0, (time / duration) * trackWidth)) : 0;

  return (
    <div className="pointer-events-none absolute bottom-0 top-0 z-20" style={{ left }}>
      <div className="-ml-2 h-0 w-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-blue-400" />
      <div className="h-full w-px bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
    </div>
  );
}

import { forwardRef, type PointerEventHandler } from 'react';

interface TimelinePlayheadProps {
  x: number;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
}

export const TimelinePlayhead = forwardRef<HTMLDivElement, TimelinePlayheadProps>(function TimelinePlayhead(
  { x, onPointerDown },
  ref
) {
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute bottom-0 top-0 z-30 will-change-transform"
      style={{ transform: `translateX(${x}px)` }}
    >
      <div
        data-timeline-interactive="true"
        className="pointer-events-auto -ml-3 flex w-6 cursor-ew-resize justify-center"
        onPointerDown={onPointerDown}
        title="拖动播放头"
      >
        <div className="h-0 w-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-cyan-300" />
      </div>
      <div className="h-full w-px bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.8)]" />
    </div>
  );
});

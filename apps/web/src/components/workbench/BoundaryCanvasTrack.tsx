import { useEffect, useRef } from 'react';
import type { Boundary } from './useTimelineBoundaries';

interface BoundaryCanvasTrackProps {
  boundaries: Boundary[];
  duration: number;
  trackWidth: number;
  scrollLeft: number;
  containerWidth: number;
  pxPerSecond: number;
  activeBoundaryId: string | null;
  selectedSegmentId: string | null;
}

export function BoundaryCanvasTrack({
  boundaries,
  duration,
  trackWidth,
  scrollLeft,
  containerWidth,
  pxPerSecond,
  activeBoundaryId,
  selectedSegmentId,
}: BoundaryCanvasTrackProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || containerWidth <= 0) return;

    const height = 48;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(containerWidth * dpr));
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, containerWidth, height);
    ctx.fillStyle = 'rgba(23, 23, 23, 0.55)';
    ctx.fillRect(0, 0, containerWidth, height);

    const visibleStart = Math.max(0, scrollLeft / Math.max(0.0001, pxPerSecond) - 2);
    const visibleEnd = Math.min(duration, (scrollLeft + containerWidth) / Math.max(0.0001, pxPerSecond) + 2);

    boundaries.forEach((boundary) => {
      if (boundary.sourceTime < visibleStart || boundary.sourceTime > visibleEnd) return;
      const x = Math.round(boundary.sourceTime * pxPerSecond - scrollLeft) + 0.5;
      const isActive = boundary.id === activeBoundaryId;
      const isSelected = boundary.segmentId && boundary.segmentId === selectedSegmentId;
      const isManual = boundary.kind === 'manual-cut';

      ctx.strokeStyle = isActive
        ? 'rgba(103, 232, 249, 0.95)'
        : isSelected
          ? 'rgba(251, 191, 36, 0.9)'
          : isManual
            ? 'rgba(251, 191, 36, 0.72)'
            : 'rgba(148, 163, 184, 0.42)';
      ctx.lineWidth = isActive || isSelected || isManual ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, isManual ? 7 : 12);
      ctx.lineTo(x, height - 8);
      ctx.stroke();
    });
  }, [activeBoundaryId, boundaries, containerWidth, duration, pxPerSecond, scrollLeft, selectedSegmentId]);

  return (
    <div className="relative h-12 border-b border-neutral-800 bg-neutral-900/50" style={{ width: trackWidth }}>
      <div className="absolute left-3 top-2 z-10 text-[11px] font-medium text-neutral-500">分割点</div>
      <canvas ref={canvasRef} className="sticky left-0 top-0 h-12" />
    </div>
  );
}

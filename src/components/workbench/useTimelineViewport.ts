import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useWorkbenchStore } from '../../stores/useWorkbenchStore';

export interface TimelineViewport {
  duration: number;
  zoom: number;
  pxPerSecond: number;
  scrollLeft: number;
  visibleStart: number;
  visibleEnd: number;
  containerWidth: number;
  contentWidth: number;
  timeToX: (time: number) => number;
  xToTime: (x: number) => number;
  clientXToTime: (clientX: number) => number;
  zoomAtPoint: (deltaY: number, anchorClientX: number) => void;
  scrollToTime: (time: number, align?: 'start' | 'center' | 'nearest') => void;
  ensurePlayheadVisible: (time: number) => void;
}

const BASE_PX_PER_SECOND = 3.2;
const MIN_CONTENT_WIDTH = 1120;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampZoom(zoom: number): number {
  return Math.min(8, Math.max(0.5, Math.round(zoom * 100) / 100));
}

export function useTimelineViewport(
  scrollRef: RefObject<HTMLDivElement | null>,
  duration: number
): TimelineViewport {
  const zoom = useWorkbenchStore((state) => state.timelineZoom);
  const setTimelineZoom = useWorkbenchStore((state) => state.setTimelineZoom);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const pendingScrollLeftRef = useRef<number | null>(null);

  const safeDuration = Math.max(1, duration);
  const pxPerSecond = BASE_PX_PER_SECOND * zoom;
  const contentWidth = Math.max(MIN_CONTENT_WIDTH, containerWidth, Math.ceil(safeDuration * pxPerSecond));
  const maxScrollLeft = Math.max(0, contentWidth - containerWidth);

  const timeToX = useCallback(
    (time: number) => clamp(Number.isFinite(time) ? time : 0, 0, safeDuration) * pxPerSecond,
    [pxPerSecond, safeDuration]
  );

  const xToTime = useCallback(
    (x: number) => clamp((Number.isFinite(x) ? x : 0) / pxPerSecond, 0, safeDuration),
    [pxPerSecond, safeDuration]
  );

  const clientXToTime = useCallback(
    (clientX: number) => {
      const el = scrollRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      return xToTime(el.scrollLeft + clientX - rect.left);
    },
    [scrollRef, xToTime]
  );

  const scrollToLeft = useCallback(
    (left: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const nextLeft = clamp(left, 0, maxScrollLeft);
      el.scrollLeft = nextLeft;
      setScrollLeft(nextLeft);
    },
    [maxScrollLeft, scrollRef]
  );

  const scrollToTime = useCallback(
    (time: number, align: 'start' | 'center' | 'nearest' = 'center') => {
      const x = timeToX(time);
      if (align === 'start') {
        scrollToLeft(x);
        return;
      }
      if (align === 'center') {
        scrollToLeft(x - containerWidth / 2);
        return;
      }

      if (x < scrollLeft) {
        scrollToLeft(x - 24);
      } else if (x > scrollLeft + containerWidth) {
        scrollToLeft(x - containerWidth + 24);
      }
    },
    [containerWidth, scrollLeft, scrollToLeft, timeToX]
  );

  const ensurePlayheadVisible = useCallback(
    (time: number) => {
      const x = timeToX(time);
      const padding = Math.min(160, Math.max(48, containerWidth * 0.12));
      if (x < scrollLeft + padding) {
        scrollToLeft(x - padding);
      } else if (x > scrollLeft + containerWidth - padding) {
        scrollToLeft(x - containerWidth + padding);
      }
    },
    [containerWidth, scrollLeft, scrollToLeft, timeToX]
  );

  const zoomAtPoint = useCallback(
    (deltaY: number, anchorClientX: number) => {
      const el = scrollRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const anchorOffset = anchorClientX - rect.left;
      const anchorTime = xToTime(el.scrollLeft + anchorOffset);
      const nextZoom = clampZoom(zoom + (deltaY < 0 ? 0.15 : -0.15));
      const nextPxPerSecond = BASE_PX_PER_SECOND * nextZoom;
      const nextContentWidth = Math.max(MIN_CONTENT_WIDTH, containerWidth, Math.ceil(safeDuration * nextPxPerSecond));
      const nextMaxScrollLeft = Math.max(0, nextContentWidth - containerWidth);
      const nextScrollLeft = clamp(anchorTime * nextPxPerSecond - anchorOffset, 0, nextMaxScrollLeft);

      pendingScrollLeftRef.current = nextScrollLeft;
      setTimelineZoom(nextZoom);
      requestAnimationFrame(() => {
        const pending = pendingScrollLeftRef.current;
        if (pending === null) return;
        pendingScrollLeftRef.current = null;
        const currentEl = scrollRef.current;
        if (!currentEl) return;
        currentEl.scrollLeft = pending;
        setScrollLeft(pending);
      });
    },
    [containerWidth, safeDuration, scrollRef, setTimelineZoom, xToTime, zoom]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const syncMetrics = () => {
      setContainerWidth(el.clientWidth);
      setScrollLeft(el.scrollLeft);
    };

    syncMetrics();
    const resizeObserver = new ResizeObserver(syncMetrics);
    resizeObserver.observe(el);
    el.addEventListener('scroll', syncMetrics, { passive: true });
    return () => {
      resizeObserver.disconnect();
      el.removeEventListener('scroll', syncMetrics);
    };
  }, [scrollRef]);

  const visibleStart = xToTime(scrollLeft);
  const visibleEnd = xToTime(scrollLeft + containerWidth);

  return useMemo(
    () => ({
      duration: safeDuration,
      zoom,
      pxPerSecond,
      scrollLeft,
      visibleStart,
      visibleEnd,
      containerWidth,
      contentWidth,
      timeToX,
      xToTime,
      clientXToTime,
      zoomAtPoint,
      scrollToTime,
      ensurePlayheadVisible,
    }),
    [
      clientXToTime,
      containerWidth,
      contentWidth,
      ensurePlayheadVisible,
      pxPerSecond,
      safeDuration,
      scrollLeft,
      scrollToTime,
      timeToX,
      visibleEnd,
      visibleStart,
      xToTime,
      zoom,
      zoomAtPoint,
    ]
  );
}

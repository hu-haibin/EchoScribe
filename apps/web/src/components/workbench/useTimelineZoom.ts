import { useEffect, type RefObject } from 'react';
import { useWorkbenchStore } from '../../stores/useWorkbenchStore';

export function useTimelineZoom(scrollRef: RefObject<HTMLElement | null>) {
  const nudgeTimelineZoom = useWorkbenchStore((state) => state.nudgeTimelineZoom);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      nudgeTimelineZoom(event.deltaY < 0 ? 0.15 : -0.15);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [nudgeTimelineZoom, scrollRef]);
}

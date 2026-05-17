import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useWorkbenchStore, type CutRange } from '../../stores/useWorkbenchStore';
import type { Segment } from '../../types';

interface PlaybackControllerOptions {
  mediaId: string | null;
  segments: Segment[];
  duration: number;
}

export interface PlaybackController {
  mediaRef: MutableRefObject<HTMLMediaElement | null>;
  currentTimeRef: MutableRefObject<number>;
  isPlayingRef: MutableRefObject<boolean>;
  seekTo: (time: number, options?: { forceDisplay?: boolean }) => void;
  scrubTo: (time: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  subscribeFrame: (listener: (time: number) => void) => () => void;
  setKnownDuration: (duration: number) => void;
  handleMediaPlay: () => void;
  handleMediaPause: () => void;
}

function clampTime(time: number, duration: number): number {
  const safeTime = Number.isFinite(time) ? time : 0;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.min(safeTime, safeDuration));
}

function isSegmentCoveredByCutRange(segment: Segment, cutRanges: CutRange[]): boolean {
  return cutRanges.some((range) => {
    if (range.segmentIds?.includes(segment.id)) return true;
    return range.sourceStart <= segment.start && range.sourceEnd >= segment.end;
  });
}

function findActiveSegmentId(segments: Segment[], cutRanges: CutRange[], time: number): string | null {
  if (segments.length === 0) return null;

  let lo = 0;
  let hi = segments.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (segments[mid].start <= time) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (result < 0) return null;
  const segment = segments[result];
  if (time < segment.start || time > segment.end) return null;
  if (segment.status === 'delete') return null;
  if (isSegmentCoveredByCutRange(segment, cutRanges)) return null;
  return segment.id;
}

function findCutRangeAt(ranges: CutRange[], time: number): CutRange | null {
  if (ranges.length === 0) return null;

  let lo = 0;
  let hi = ranges.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (ranges[mid].sourceStart <= time) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (result < 0) return null;
  const range = ranges[result];
  if (time < range.sourceStart || time >= range.sourceEnd) return null;

  let mergedEnd = range.sourceEnd;
  for (let index = result + 1; index < ranges.length; index += 1) {
    const next = ranges[index];
    if (next.sourceStart > mergedEnd + 0.001) break;
    mergedEnd = Math.max(mergedEnd, next.sourceEnd);
  }

  return mergedEnd === range.sourceEnd ? range : { ...range, sourceEnd: mergedEnd };
}

export function usePlaybackController({
  mediaId,
  segments,
  duration,
}: PlaybackControllerOptions): PlaybackController {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const currentTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const durationRef = useRef(Math.max(0, duration || 0));
  const mediaIdRef = useRef(mediaId);
  const segmentsRef = useRef(segments);
  const cutRangesRef = useRef<CutRange[]>([]);
  const activeSegmentIdRef = useRef<string | null>(null);
  const lastDisplayCommitRef = useRef(0);
  const frameListenersRef = useRef(new Set<(time: number) => void>());
  const rafRef = useRef<number | null>(null);

  const allCutRanges = useWorkbenchStore((state) => state.cutRanges);
  const setPlayheadDisplayTime = useWorkbenchStore((state) => state.setPlayheadDisplayTime);
  const setActiveSegmentId = useWorkbenchStore((state) => state.setActiveSegmentId);
  const setActiveBoundaryId = useWorkbenchStore((state) => state.setActiveBoundaryId);
  const setLastActionMessage = useWorkbenchStore((state) => state.setLastActionMessage);
  const setPlaying = usePlayerStore((state) => state.setPlaying);

  useEffect(() => {
    mediaIdRef.current = mediaId;
  }, [mediaId]);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    durationRef.current = Math.max(0, duration || 0);
  }, [duration]);

  useEffect(() => {
    cutRangesRef.current = allCutRanges
      .filter((range) => range.mediaId === mediaId)
      .slice()
      .sort((a, b) => a.sourceStart - b.sourceStart || a.sourceEnd - b.sourceEnd);
  }, [allCutRanges, mediaId]);

  const notifyFrame = useCallback((time: number) => {
    frameListenersRef.current.forEach((listener) => listener(time));
  }, []);

  const commitDisplayTime = useCallback(
    (time: number, force = false) => {
      const now = performance.now();
      if (!force && now - lastDisplayCommitRef.current < 220) return;
      lastDisplayCommitRef.current = now;
      setPlayheadDisplayTime(time);
    },
    [setPlayheadDisplayTime]
  );

  const commitActiveSegment = useCallback(
    (time: number) => {
      const nextId = findActiveSegmentId(segmentsRef.current, cutRangesRef.current, time);
      if (nextId === activeSegmentIdRef.current) return;
      activeSegmentIdRef.current = nextId;
      setActiveSegmentId(nextId);
      setActiveBoundaryId(nextId && mediaIdRef.current ? `segment-start:${mediaIdRef.current}:${nextId}` : null);
    },
    [setActiveBoundaryId, setActiveSegmentId]
  );

  const setKnownDuration = useCallback((nextDuration: number) => {
    durationRef.current = Math.max(0, Number.isFinite(nextDuration) ? nextDuration : 0);
    usePlayerStore.getState().setDuration(durationRef.current);
  }, []);

  const seekTo = useCallback(
    (time: number, options?: { forceDisplay?: boolean }) => {
      const media = mediaRef.current;
      const durationLimit = media?.duration && Number.isFinite(media.duration) ? media.duration : durationRef.current;
      const nextTime = clampTime(time, durationLimit);
      if (media) {
        media.currentTime = nextTime;
      }
      currentTimeRef.current = nextTime;
      notifyFrame(nextTime);
      commitDisplayTime(nextTime, options?.forceDisplay ?? true);
      commitActiveSegment(nextTime);
    },
    [commitActiveSegment, commitDisplayTime, notifyFrame]
  );

  const scrubTo = useCallback(
    (time: number) => {
      const media = mediaRef.current;
      const durationLimit = media?.duration && Number.isFinite(media.duration) ? media.duration : durationRef.current;
      const nextTime = clampTime(time, durationLimit);
      if (media) {
        media.currentTime = nextTime;
      }
      currentTimeRef.current = nextTime;
      notifyFrame(nextTime);
      commitDisplayTime(nextTime);
      commitActiveSegment(nextTime);
    },
    [commitActiveSegment, commitDisplayTime, notifyFrame]
  );

  const handleMediaPlay = useCallback(() => {
    isPlayingRef.current = true;
    setPlaying(true);
  }, [setPlaying]);

  const handleMediaPause = useCallback(() => {
    isPlayingRef.current = false;
    setPlaying(false);
  }, [setPlaying]);

  const play = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    void media.play().catch(() => {
      isPlayingRef.current = false;
      setPlaying(false);
      setLastActionMessage('播放失败，浏览器阻止了自动播放');
    });
  }, [setLastActionMessage, setPlaying]);

  const pause = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    media.pause();
    handleMediaPause();
  }, [handleMediaPause]);

  const togglePlay = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) {
      play();
    } else {
      pause();
    }
  }, [pause, play]);

  const getCurrentTime = useCallback(() => currentTimeRef.current, []);
  const getDuration = useCallback(() => durationRef.current, []);

  const subscribeFrame = useCallback((listener: (time: number) => void) => {
    frameListenersRef.current.add(listener);
    listener(currentTimeRef.current);
    return () => {
      frameListenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const media = mediaRef.current;
      if (media) {
        let nextTime = media.currentTime || 0;
        const cutRange = isPlayingRef.current ? findCutRangeAt(cutRangesRef.current, nextTime) : null;

        if (cutRange) {
          const durationLimit =
            media.duration && Number.isFinite(media.duration) ? media.duration : durationRef.current;
          nextTime = clampTime(cutRange.sourceEnd + 0.001, durationLimit);
          media.currentTime = nextTime;
        }

        currentTimeRef.current = nextTime;
        notifyFrame(nextTime);
        commitDisplayTime(nextTime, Boolean(cutRange));
        commitActiveSegment(nextTime);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [commitActiveSegment, commitDisplayTime, notifyFrame]);

  return useMemo(
    () => ({
      mediaRef,
      currentTimeRef,
      isPlayingRef,
      seekTo,
      scrubTo,
      play,
      pause,
      togglePlay,
      getCurrentTime,
      getDuration,
      subscribeFrame,
      setKnownDuration,
      handleMediaPlay,
      handleMediaPause,
    }),
    [
      getCurrentTime,
      getDuration,
      handleMediaPause,
      handleMediaPlay,
      pause,
      play,
      scrubTo,
      seekTo,
      setKnownDuration,
      subscribeFrame,
      togglePlay,
    ]
  );
}

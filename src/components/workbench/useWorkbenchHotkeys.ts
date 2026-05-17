import { useEffect } from 'react';
import { useSubtitleStore } from '../../stores/useSubtitleStore';
import { useWorkbenchStore, type CutRange } from '../../stores/useWorkbenchStore';
import type { Segment } from '../../types';
import type { PlaybackController } from './usePlaybackController';
import type { Boundary } from './useTimelineBoundaries';

const NUDGE_SECONDS = 1;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function segmentIsDeleted(segment: Segment, cutRanges: CutRange[], mediaId: string | null): boolean {
  if (segment.status === 'delete') return true;
  return cutRanges.some((range) => {
    if (range.mediaId !== mediaId) return false;
    if (range.segmentIds?.includes(segment.id)) return true;
    return range.sourceStart <= segment.start && range.sourceEnd >= segment.end;
  });
}

function findSegmentAtTime(segments: Segment[], cutRanges: CutRange[], mediaId: string | null, time: number): Segment | null {
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
  if (segmentIsDeleted(segment, cutRanges, mediaId)) return null;
  return segment;
}

function nudge(controller: PlaybackController, direction: -1 | 1) {
  const workbenchState = useWorkbenchStore.getState();
  const nextTime = Math.max(
    0,
    Math.min(controller.getDuration() || Number.MAX_SAFE_INTEGER, controller.getCurrentTime() + direction * NUDGE_SECONDS)
  );
  controller.seekTo(nextTime, { forceDisplay: true });
  workbenchState.setLastActionMessage(direction < 0 ? '向前小跳 1s' : '向后小跳 1s');
}

function seekBoundaryAtOffset(offset: -1 | 1, controller: PlaybackController, boundaries: Boundary[]) {
  const workbenchState = useWorkbenchStore.getState();
  const subtitleState = useSubtitleStore.getState();
  const mediaId = workbenchState.selectedMediaId;
  const baseTime = controller.getCurrentTime();
  const boundary =
    offset > 0
      ? boundaries.find((item) => item.sourceTime > baseTime + 0.001)
      : boundaries
          .slice()
          .reverse()
          .find((item) => item.sourceTime < baseTime - 0.001);

  if (!boundary) {
    workbenchState.setLastActionMessage(offset > 0 ? '已经是最后一个分割点' : '已经是第一个分割点');
    return;
  }

  const segment = boundary.segmentId
    ? subtitleState.segments.find((item) => item.id === boundary.segmentId) ?? null
    : findSegmentAtTime(subtitleState.segments, workbenchState.cutRanges, mediaId, boundary.sourceTime);

  workbenchState.setSelectedRange(null);
  workbenchState.setActiveBoundaryId(boundary.id);
  if (boundary.segmentId) {
    workbenchState.setSelectedSegmentId(boundary.segmentId);
  } else {
    workbenchState.setSelectedSegmentId(null);
  }
  workbenchState.setActiveSegmentId(segment?.id ?? null);
  controller.seekTo(boundary.sourceTime, { forceDisplay: true });
  workbenchState.setLastActionMessage(offset > 0 ? '已跳到下一个分割点' : '已跳到上一个分割点');
}

function addCutPoint(controller: PlaybackController) {
  const workbenchState = useWorkbenchStore.getState();
  if (!workbenchState.selectedMediaId) {
    workbenchState.setLastActionMessage('请先选择素材');
    return;
  }
  workbenchState.addCutPoint({
    mediaId: workbenchState.selectedMediaId,
    sourceTime: controller.getCurrentTime(),
  });
}

function deleteCurrentSelection() {
  const subtitleState = useSubtitleStore.getState();
  const workbenchState = useWorkbenchStore.getState();
  const mediaId = workbenchState.selectedMediaId;
  if (!mediaId) {
    workbenchState.setLastActionMessage('请先选择素材');
    return;
  }

  if (workbenchState.selectedRange && workbenchState.selectedRange.sourceEnd - workbenchState.selectedRange.sourceStart > 0.03) {
    workbenchState.addCutRange({
      mediaId,
      sourceStart: workbenchState.selectedRange.sourceStart,
      sourceEnd: workbenchState.selectedRange.sourceEnd,
      reason: 'manual-delete',
    });
    return;
  }

  const segmentId = workbenchState.selectedSegmentId ?? workbenchState.activeSegmentId;
  const segment = segmentId ? subtitleState.segments.find((item) => item.id === segmentId) : null;
  if (!segment) {
    workbenchState.setLastActionMessage('没有选中的段落或区间');
    return;
  }

  workbenchState.addCutRange({
    mediaId,
    sourceStart: segment.start,
    sourceEnd: segment.end,
    reason: 'segment-delete',
    segmentIds: [segment.id],
  });
}

export function useWorkbenchHotkeys(controller: PlaybackController, boundaries: Boundary[]) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const workbenchState = useWorkbenchStore.getState();

      if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        workbenchState.undo();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && (key === 'y' || (key === 'z' && event.shiftKey))) {
        event.preventDefault();
        workbenchState.redo();
        return;
      }

      if (event.shiftKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        nudge(controller, -1);
        return;
      }

      if (event.shiftKey && event.key === 'ArrowRight') {
        event.preventDefault();
        nudge(controller, 1);
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.code === 'Space') {
        event.preventDefault();
        controller.togglePlay();
        workbenchState.setLastActionMessage('播放 / 暂停');
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        seekBoundaryAtOffset(-1, controller, boundaries);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        seekBoundaryAtOffset(1, controller, boundaries);
        return;
      }

      if (key === 's') {
        event.preventDefault();
        addCutPoint(controller);
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteCurrentSelection();
        return;
      }

      if (key === 'k') {
        event.preventDefault();
        controller.pause();
        workbenchState.setLastActionMessage('暂停');
        return;
      }

      if (key === 'j' || key === 'l') {
        event.preventDefault();
        workbenchState.setLastActionMessage(key === 'j' ? 'J 后退入口已预留' : 'L 前进入口已预留');
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const subtitleState = useSubtitleStore.getState();
        const selectedSegment = subtitleState.segments.find((segment) => segment.id === workbenchState.selectedSegmentId);
        if (selectedSegment) {
          controller.seekTo(selectedSegment.start, { forceDisplay: true });
        }
        controller.play();
        workbenchState.setLastActionMessage('从当前段落播放');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [boundaries, controller]);
}

import { useEffect } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useSubtitleStore } from '../../stores/useSubtitleStore';
import { useWorkbenchStore } from '../../stores/useWorkbenchStore';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

function seekSegmentAtOffset(offset: -1 | 1) {
  const subtitleState = useSubtitleStore.getState();
  const workbenchState = useWorkbenchStore.getState();
  const playerState = usePlayerStore.getState();
  const { segments } = subtitleState;
  if (segments.length === 0) return;

  const selectedIndex = workbenchState.selectedSegmentId
    ? segments.findIndex((segment) => segment.id === workbenchState.selectedSegmentId)
    : -1;
  const activeIndex =
    selectedIndex >= 0 ? selectedIndex : subtitleState.getActiveIndex(workbenchState.playheadDisplayTime);
  const nextIndex = Math.max(0, Math.min(segments.length - 1, activeIndex + offset));
  const nextSegment = segments[nextIndex];

  workbenchState.setSelectedSegmentId(nextSegment.id);
  workbenchState.setActiveSegmentId(nextSegment.id);
  workbenchState.setPlayheadDisplayTime(nextSegment.start);
  workbenchState.setLastActionMessage(offset < 0 ? '已跳到上一段' : '已跳到下一段');
  playerState.seekTo(nextSegment.start);
}

function markSelectedSegmentForDelete() {
  const subtitleState = useSubtitleStore.getState();
  const workbenchState = useWorkbenchStore.getState();
  const selectedSegment = subtitleState.segments.find((segment) => segment.id === workbenchState.selectedSegmentId);

  if (selectedSegment) {
    workbenchState.addPendingCutRange({
      start: selectedSegment.start,
      end: selectedSegment.end,
      source: 'segment',
      segmentId: selectedSegment.id,
      previousStatus: selectedSegment.status,
    });
    subtitleState.updateStatus(selectedSegment.id, 'delete');
    return;
  }

  const start = workbenchState.playheadDisplayTime;
  workbenchState.addPendingCutRange({ start, end: start + 2, source: 'manual' });
}

function undoPendingAction() {
  const action = useWorkbenchStore.getState().undoPendingAction();
  if (action?.type === 'cutRange' && action.item.segmentId && action.item.previousStatus) {
    useSubtitleStore.getState().updateStatus(action.item.segmentId, action.item.previousStatus);
  }
}

function redoPendingAction() {
  const action = useWorkbenchStore.getState().redoPendingAction();
  if (action?.type === 'cutRange' && action.item.segmentId) {
    useSubtitleStore.getState().updateStatus(action.item.segmentId, 'delete');
  }
}

export function useWorkbenchHotkeys() {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      const workbenchState = useWorkbenchStore.getState();
      const playerState = usePlayerStore.getState();

      if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undoPendingAction();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && (key === 'y' || (key === 'z' && event.shiftKey))) {
        event.preventDefault();
        redoPendingAction();
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.code === 'Space') {
        event.preventDefault();
        playerState.togglePlay();
        workbenchState.setLastActionMessage('播放 / 暂停');
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        seekSegmentAtOffset(-1);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        seekSegmentAtOffset(1);
        return;
      }

      if (key === 's') {
        event.preventDefault();
        workbenchState.addPendingCutPoint(workbenchState.playheadDisplayTime);
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        markSelectedSegmentForDelete();
        return;
      }

      if (key === 'k') {
        event.preventDefault();
        playerState.mediaElement?.pause();
        playerState.setPlaying(false);
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
          playerState.seekTo(selectedSegment.start);
          workbenchState.setPlayheadDisplayTime(selectedSegment.start);
        }
        playerState.mediaElement?.play();
        playerState.setPlaying(true);
        workbenchState.setLastActionMessage('从当前段落播放');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}

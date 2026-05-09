import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSubtitleStore } from '../stores/useSubtitleStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { SubtitleRow } from './SubtitleRow';

export const SubtitlePanel: React.FC = () => {
  const parentRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const segments = useSubtitleStore((s) => s.segments);
  const editingId = useSubtitleStore((s) => s.editingId);
  const startEditing = useSubtitleStore((s) => s.startEditing);
  const cancelEditing = useSubtitleStore((s) => s.cancelEditing);
  const updateText = useSubtitleStore((s) => s.updateText);
  const updateStatus = useSubtitleStore((s) => s.updateStatus);
  const getActiveIndex = useSubtitleStore((s) => s.getActiveIndex);

  const currentTime = usePlayerStore((s) => s.currentTime);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const seekTo = usePlayerStore((s) => s.seekTo);

  const activeIndex = useMemo(() => getActiveIndex(currentTime), [getActiveIndex, currentTime]);

  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 8,
  });

  // 用户主动滚动时暂停自动滚动
  const handleScroll = useCallback(() => {
    isUserScrolling.current = true;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      isUserScrolling.current = false;
    }, 3000); // 用户停止滚动 3 秒后恢复自动滚动
  }, []);

  // 播放时自动滚动到当前字幕
  useEffect(() => {
    if (isPlaying && activeIndex >= 0 && !isUserScrolling.current) {
      virtualizer.scrollToIndex(activeIndex, {
        align: 'center',
        behavior: 'smooth',
      });
    }
  }, [activeIndex, isPlaying, virtualizer]);

  const handleSeek = useCallback(
    (time: number) => {
      seekTo(time);
      isUserScrolling.current = false; // 点击字幕跳转时恢复自动滚动
    },
    [seekTo]
  );

  const handleSaveEdit = useCallback(
    (id: string, text: string) => {
      updateText(id, text);
    },
    [updateText]
  );

  return (
    <div id="subtitle-panel" className="flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-200">字幕</h3>
          <span className="text-xs text-neutral-500 bg-neutral-800 px-2 py-0.5 rounded-md">
            {segments.length} 条
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-neutral-500">
          <span className="text-green-400">✓</span>保留
          <span className="ml-1 text-red-400">✕</span>删除
          <span className="ml-1 text-amber-400">★</span>重点
          <span className="ml-1 text-blue-400">?</span>待检查
        </div>
      </div>

      {/* 虚拟化列表 */}
      <div
        ref={parentRef}
        onWheel={handleScroll}
        className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const segment = segments[virtualRow.index];
            return (
              <SubtitleRow
                key={segment.id}
                segment={segment}
                isActive={virtualRow.index === activeIndex}
                isEditing={editingId === segment.id}
                onSeek={handleSeek}
                onStartEdit={startEditing}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={cancelEditing}
                onStatusChange={updateStatus}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

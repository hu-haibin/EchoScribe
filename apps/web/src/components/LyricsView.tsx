import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSubtitleStore } from '../stores/useSubtitleStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import type { SegmentStatus } from '../types';

const STATUS_CYCLE: SegmentStatus[] = ['review', 'keep', 'delete'];
const STATUS_ICONS: Record<SegmentStatus, string> = {
  review: '?',
  keep: '✓',
  delete: '✕',
};
const STATUS_COLORS: Record<SegmentStatus, string> = {
  review: 'text-blue-400',
  keep: 'text-green-400',
  delete: 'text-red-400',
};
const STATUS_LABELS: Record<SegmentStatus, string> = {
  review: '待复核',
  keep: '保留',
  delete: '删除',
};

/** 格式化秒数为 mm:ss */
function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const LyricsView: React.FC = () => {
  const parentRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const segments = useSubtitleStore((s) => s.segments);
  const editingId = useSubtitleStore((s) => s.editingId);
  const startEditing = useSubtitleStore((s) => s.startEditing);
  const cancelEditing = useSubtitleStore((s) => s.cancelEditing);
  const updateText = useSubtitleStore((s) => s.updateText);
  const updateStatus = useSubtitleStore((s) => s.updateStatus);
  const toggleImportant = useSubtitleStore((s) => s.toggleImportant);
  const toggleNeedsCheck = useSubtitleStore((s) => s.toggleNeedsCheck);
  const getActiveIndex = useSubtitleStore((s) => s.getActiveIndex);

  const currentTime = usePlayerStore((s) => s.currentTime);
  const seekTo = usePlayerStore((s) => s.seekTo);

  const activeIndex = useMemo(() => getActiveIndex(currentTime), [getActiveIndex, currentTime]);

  // 每行高度：当前高亮行大一些，其他行小一些
  const ROW_HEIGHT = 72;

  const virtualizer = useVirtualizer({
    count: segments.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    // 增加 padding 让第一条/最后一条也能居中
    paddingStart: typeof window !== 'undefined' ? Math.floor(window.innerHeight / 2 - 80) : 300,
    paddingEnd: typeof window !== 'undefined' ? Math.floor(window.innerHeight / 2 - 80) : 300,
  });

  // 用户主动滚动时暂停自动滚动
  const handleUserScroll = useCallback(() => {
    isUserScrolling.current = true;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      isUserScrolling.current = false;
    }, 3000);
  }, []);

  // 自动滚动到当前字幕（无论是否播放）
  useEffect(() => {
    if (activeIndex >= 0 && !isUserScrolling.current) {
      virtualizer.scrollToIndex(activeIndex, {
        align: 'center',
        behavior: 'smooth',
      });
    }
  }, [activeIndex, virtualizer]);

  const handleSeek = useCallback(
    (time: number) => {
      seekTo(time);
      isUserScrolling.current = false;
    },
    [seekTo]
  );

  return (
    <div
      id="lyrics-view"
      ref={parentRef}
      onWheel={handleUserScroll}
      className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent"
      style={{ scrollBehavior: 'auto' }}
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
          const isActive = virtualRow.index === activeIndex;
          const distance = Math.abs(virtualRow.index - (activeIndex >= 0 ? activeIndex : 0));
          const isEditing = editingId === segment.id;
          const isDeleted = segment.status === 'delete';

          // 距离越远越淡
          let opacity = 1;
          if (activeIndex >= 0) {
            if (distance === 0) opacity = 1;
            else if (distance === 1) opacity = 0.6;
            else if (distance === 2) opacity = 0.4;
            else if (distance === 3) opacity = 0.3;
            else opacity = 0.2;
          }

          return (
            <LyricsLine
              key={segment.id}
              segment={segment}
              isActive={isActive}
              isEditing={isEditing}
              isDeleted={isDeleted}
              opacity={opacity}
              onSeek={handleSeek}
              onStartEdit={startEditing}
              onSaveEdit={updateText}
              onCancelEdit={cancelEditing}
              onStatusChange={updateStatus}
              onToggleImportant={toggleImportant}
              onToggleNeedsCheck={toggleNeedsCheck}
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
  );
};

// ===== 单行歌词组件 =====

interface LyricsLineProps {
  segment: {
    id: string;
    start: number;
    end: number;
    raw_text: string;
    edited_text: string;
    speaker?: string;
    status: SegmentStatus;
    important: boolean;
    needsCheck: boolean;
  };
  isActive: boolean;
  isEditing: boolean;
  isDeleted: boolean;
  opacity: number;
  onSeek: (time: number) => void;
  onStartEdit: (id: string) => void;
  onSaveEdit: (id: string, text: string) => void;
  onCancelEdit: () => void;
  onStatusChange: (id: string, status: SegmentStatus) => void;
  onToggleImportant: (id: string) => void;
  onToggleNeedsCheck: (id: string) => void;
  style: React.CSSProperties;
}

const LyricsLine = React.memo<LyricsLineProps>(
  ({ segment, isActive, isEditing, isDeleted, opacity, onSeek, onStartEdit, onSaveEdit, onCancelEdit, onStatusChange, onToggleImportant, onToggleNeedsCheck, style }) => {
    const [editText, setEditText] = useState(segment.edited_text);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
      if (isEditing) {
        setEditText(segment.edited_text);
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      }
    }, [isEditing, segment.edited_text]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSaveEdit(segment.id, editText);
        } else if (e.key === 'Escape') {
          onCancelEdit();
        }
      },
      [segment.id, editText, onSaveEdit, onCancelEdit]
    );

    const cycleStatus = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        const currentIdx = STATUS_CYCLE.indexOf(segment.status);
        const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];
        onStatusChange(segment.id, nextStatus);
      },
      [segment.id, segment.status, onStatusChange]
    );

    const toggleImportant = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleImportant(segment.id);
      },
      [segment.id, onToggleImportant]
    );

    const toggleNeedsCheck = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleNeedsCheck(segment.id);
      },
      [segment.id, onToggleNeedsCheck]
    );

    const hasEdit = segment.raw_text !== segment.edited_text;
    const currentStatusIdx = STATUS_CYCLE.indexOf(segment.status);
    const nextStatus = STATUS_CYCLE[(currentStatusIdx + 1) % STATUS_CYCLE.length];

    return (
      <div
        style={{ ...style, opacity: isEditing ? 1 : opacity }}
        className={`
          group flex items-center justify-center px-8
          transition-all duration-500 ease-out cursor-pointer select-none
        `}
        onClick={() => onSeek(segment.start)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (!isEditing) onStartEdit(segment.id);
        }}
      >
          <div className="relative max-w-3xl w-full text-center">
          {isEditing ? (
            // 编辑模式
            <textarea
              ref={inputRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => onSaveEdit(segment.id, editText)}
              onClick={(e) => e.stopPropagation()}
              rows={2}
              className="w-full bg-neutral-800/80 border border-blue-500/40 rounded-xl px-6 py-3 text-lg text-center text-neutral-100 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 backdrop-blur-sm"
            />
          ) : (
            // 歌词显示
            <div>
              {segment.speaker && (
                <div className="mb-2 flex items-center justify-center">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide ${
                      isActive
                        ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
                        : 'border-neutral-700 bg-neutral-900/70 text-neutral-500'
                    }`}
                  >
                    {segment.speaker}
                  </span>
                </div>
              )}
              <p
                className={`
                  transition-all duration-500 ease-out leading-relaxed
                  ${isActive
                    ? 'text-[1.4rem] font-semibold text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.15)]'
                    : 'text-base font-normal text-neutral-400'
                  }
                  ${isDeleted ? 'line-through text-neutral-600' : ''}
                `}
              >
                {segment.edited_text}
                {hasEdit && isActive && (
                  <span className="ml-2 text-xs text-amber-400/50 font-normal align-super">已修改</span>
                )}
                {segment.important && (
                  <span className="ml-2 text-xs text-amber-400/60 font-normal align-super">重点</span>
                )}
                {segment.needsCheck && (
                  <span className="ml-2 text-xs text-sky-400/60 font-normal align-super">待确认</span>
                )}
              </p>
            </div>
          )}

          {/* 右侧悬浮信息：时间码 + 状态 */}
          <div className={`
            absolute right-0 top-1/2 -translate-y-1/2 translate-x-[calc(100%+16px)]
            flex items-center gap-2 whitespace-nowrap
            transition-opacity duration-300
            ${isActive ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'}
          `}>
            <span className="text-xs font-mono text-neutral-500 tabular-nums">
              {formatTime(segment.start)}
            </span>
            <button
              onClick={cycleStatus}
              className={`text-sm ${STATUS_COLORS[segment.status]} hover:scale-125 transition-transform`}
              title={`当前${STATUS_LABELS[segment.status]}，点击改为${STATUS_LABELS[nextStatus]}`}
            >
              {STATUS_ICONS[segment.status]}
            </button>
            <button
              onClick={toggleImportant}
              className={`text-sm transition-transform hover:scale-125 ${segment.important ? 'text-amber-400' : 'text-neutral-600 hover:text-amber-400'}`}
              title={segment.important ? '取消重点' : '标为重点'}
            >
              ★
            </button>
            <button
              onClick={toggleNeedsCheck}
              className={`text-sm font-bold transition-transform hover:scale-125 ${segment.needsCheck ? 'text-sky-400' : 'text-neutral-600 hover:text-sky-400'}`}
              title={segment.needsCheck ? '取消待确认' : '标为待确认'}
            >
              !
            </button>
          </div>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.segment === next.segment &&
    prev.isActive === next.isActive &&
    prev.isEditing === next.isEditing &&
    prev.opacity === next.opacity &&
    prev.segment.important === next.segment.important &&
    prev.segment.needsCheck === next.segment.needsCheck &&
    prev.style.transform === next.style.transform
);

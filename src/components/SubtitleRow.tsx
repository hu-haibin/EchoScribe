import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Segment, SegmentStatus } from '../types';

interface SubtitleRowProps {
  segment: Segment;
  isActive: boolean;
  isEditing: boolean;
  onSeek: (time: number) => void;
  onStartEdit: (id: string) => void;
  onSaveEdit: (id: string, text: string) => void;
  onCancelEdit: () => void;
  onStatusChange: (id: string, status: SegmentStatus) => void;
  onToggleImportant: (id: string) => void;
  onToggleNeedsCheck: (id: string) => void;
  style: React.CSSProperties;
}

const STATUS_CONFIG: Record<SegmentStatus, { icon: string; label: string; color: string }> = {
  review: { icon: '?', label: '待复核', color: 'text-blue-400' },
  keep: { icon: '✓', label: '保留', color: 'text-green-400' },
  delete: { icon: '✕', label: '删除', color: 'text-red-400' },
};

const STATUS_CYCLE: SegmentStatus[] = ['review', 'keep', 'delete'];

/** 格式化秒数为 mm:ss */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const SubtitleRow = React.memo<SubtitleRowProps>(
  ({ segment, isActive, isEditing, onSeek, onStartEdit, onSaveEdit, onCancelEdit, onStatusChange, onToggleImportant, onToggleNeedsCheck, style }) => {
    const [editText, setEditText] = useState(segment.edited_text);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
      if (isEditing) {
        setEditText(segment.edited_text);
        // 延迟聚焦，等 DOM 渲染
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

    const cycleStatus = useCallback(() => {
      const currentIdx = STATUS_CYCLE.indexOf(segment.status);
      const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];
      onStatusChange(segment.id, nextStatus);
    }, [segment.id, segment.status, onStatusChange]);

    const toggleImportant = useCallback(() => {
      onToggleImportant(segment.id);
    }, [segment.id, onToggleImportant]);

    const toggleNeedsCheck = useCallback(() => {
      onToggleNeedsCheck(segment.id);
    }, [segment.id, onToggleNeedsCheck]);

    const isDeleted = segment.status === 'delete';
    const statusInfo = STATUS_CONFIG[segment.status];
    const hasEdit = segment.raw_text !== segment.edited_text;

    return (
      <div
        style={style}
        className={`
          group flex items-stretch gap-0 px-2 transition-colors duration-200
          ${isActive ? 'bg-blue-500/10' : 'hover:bg-neutral-800/50'}
        `}
      >
        {/* 左侧激活指示条 */}
        <div className={`
          w-0.5 rounded-full shrink-0 my-2 mr-3 transition-all duration-300
          ${isActive ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.4)]' : 'bg-transparent'}
        `} />

        {/* 时间码 */}
        <button
          onClick={() => onSeek(segment.start)}
          className={`
            shrink-0 w-14 py-3 text-xs font-mono tabular-nums text-left
            transition-colors
            ${isActive ? 'text-blue-400' : 'text-neutral-500 hover:text-neutral-300'}
          `}
        >
          {formatTime(segment.start)}
        </button>

        {/* 字幕内容 */}
        <div
          className="flex-1 py-2.5 min-w-0"
          onDoubleClick={() => !isEditing && onStartEdit(segment.id)}
        >
          {isEditing ? (
            <textarea
              ref={inputRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => onSaveEdit(segment.id, editText)}
              rows={2}
              className="w-full bg-neutral-800 border border-blue-500/50 rounded-lg px-3 py-2 text-sm text-neutral-100 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
          ) : (
            <p className={`
              text-sm leading-relaxed cursor-pointer select-none
              ${isActive ? 'text-neutral-100 font-medium' : 'text-neutral-300'}
              ${isDeleted ? 'line-through opacity-40' : ''}
            `}>
              {segment.edited_text}
              {hasEdit && (
                <span className="ml-1.5 text-[10px] text-amber-500/60 align-super">已修改</span>
              )}
              {segment.important && (
                <span className="ml-1.5 text-[10px] text-amber-500/60 align-super">重点</span>
              )}
              {segment.needsCheck && (
                <span className="ml-1.5 text-[10px] text-sky-400/60 align-super">待确认</span>
              )}
            </p>
          )}
        </div>

        {/* 状态和标签 */}
        <button
          onClick={cycleStatus}
          title={`${statusInfo.label} (点击切换)`}
          className={`
            shrink-0 w-8 flex items-center justify-center text-sm
            opacity-0 group-hover:opacity-100 transition-opacity
            ${isActive ? 'opacity-100' : ''}
            ${statusInfo.color}
          `}
        >
          {statusInfo.icon}
        </button>
        <button
          onClick={toggleImportant}
          title={segment.important ? '取消重点' : '标为重点'}
          className={`shrink-0 w-7 flex items-center justify-center text-sm opacity-40 group-hover:opacity-100 transition-opacity ${segment.important ? 'text-amber-400 opacity-100' : 'text-neutral-600 hover:text-amber-400'}`}
        >
          ★
        </button>
        <button
          onClick={toggleNeedsCheck}
          title={segment.needsCheck ? '取消待确认' : '标为待确认'}
          className={`shrink-0 w-7 flex items-center justify-center text-sm font-bold opacity-40 group-hover:opacity-100 transition-opacity ${segment.needsCheck ? 'text-sky-400 opacity-100' : 'text-neutral-600 hover:text-sky-400'}`}
        >
          !
        </button>
      </div>
    );
  },
  (prev, next) =>
    prev.segment === next.segment &&
    prev.isActive === next.isActive &&
    prev.isEditing === next.isEditing &&
    prev.style.transform === next.style.transform
);

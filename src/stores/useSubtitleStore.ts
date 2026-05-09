import { create } from 'zustand';
import type { Segment, SegmentStatus } from '../types';

interface SubtitleState {
  segments: Segment[];
  editingId: string | null;

  /** 加载字幕数据 */
  setSegments: (segments: Segment[]) => void;

  /** 开始编辑某条字幕 */
  startEditing: (id: string) => void;

  /** 取消编辑 */
  cancelEditing: () => void;

  /** 更新字幕文字 */
  updateText: (id: string, text: string) => void;

  /** 更新字幕标记 */
  updateStatus: (id: string, status: SegmentStatus) => void;

  /** 切换重点标签 */
  toggleImportant: (id: string) => void;

  /** 切换待确认标签 */
  toggleNeedsCheck: (id: string) => void;

  /** 根据当前时间二分查找活跃字幕索引 */
  getActiveIndex: (currentTime: number) => number;
}

export const useSubtitleStore = create<SubtitleState>((set, get) => ({
  segments: [],
  editingId: null,

  setSegments: (segments) => set({ segments, editingId: null }),

  startEditing: (id) => set({ editingId: id }),

  cancelEditing: () => set({ editingId: null }),

  updateText: (id, text) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === id
          ? { ...seg, edited_text: text, status: seg.status === 'review' ? 'keep' : seg.status }
          : seg
      ),
      editingId: null,
    })),

  updateStatus: (id, status) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === id ? { ...seg, status } : seg
      ),
    })),

  toggleImportant: (id) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === id ? { ...seg, important: !seg.important } : seg
      ),
    })),

  toggleNeedsCheck: (id) =>
    set((s) => ({
      segments: s.segments.map((seg) =>
        seg.id === id ? { ...seg, needsCheck: !seg.needsCheck } : seg
      ),
    })),

  getActiveIndex: (currentTime) => {
    const { segments } = get();
    if (segments.length === 0) return -1;

    let lo = 0;
    let hi = segments.length - 1;
    let result = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (segments[mid].start <= currentTime) {
        result = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (result >= 0 && currentTime <= segments[result].end) {
      return result;
    }

    if (result === -1 && currentTime <= segments[0].start) {
      return 0;
    }

    return result;
  },
}));

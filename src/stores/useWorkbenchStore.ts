import { create } from 'zustand';
import type { SegmentStatus } from '../types';

export type WorkbenchTool = 'select' | 'blade';

export interface SelectedRange {
  start: number;
  end: number;
}

export interface PendingCutPoint {
  id: string;
  time: number;
}

export interface PendingCutRange {
  id: string;
  start: number;
  end: number;
  source: 'segment' | 'manual';
  segmentId?: string;
  previousStatus?: SegmentStatus;
}

type PendingHistoryItem =
  | { type: 'cutPoint'; item: PendingCutPoint }
  | { type: 'cutRange'; item: PendingCutRange };

interface WorkbenchState {
  selectedMediaId: string | null;
  activeSegmentId: string | null;
  selectedSegmentId: string | null;
  timelineZoom: number;
  playheadDisplayTime: number;
  followPlayhead: boolean;
  selectedRange: SelectedRange | null;
  currentTool: WorkbenchTool;
  pendingCutRanges: PendingCutRange[];
  pendingCutPoints: PendingCutPoint[];
  lastActionMessage: string;
  undoStack: PendingHistoryItem[];
  redoStack: PendingHistoryItem[];

  setSelectedMediaId: (id: string | null) => void;
  setActiveSegmentId: (id: string | null) => void;
  setSelectedSegmentId: (id: string | null) => void;
  setTimelineZoom: (zoom: number) => void;
  nudgeTimelineZoom: (delta: number) => void;
  setPlayheadDisplayTime: (time: number) => void;
  setFollowPlayhead: (enabled: boolean) => void;
  setSelectedRange: (range: SelectedRange | null) => void;
  setCurrentTool: (tool: WorkbenchTool) => void;
  setLastActionMessage: (message: string) => void;
  addPendingCutPoint: (time: number) => void;
  addPendingCutRange: (range: Omit<PendingCutRange, 'id'>) => void;
  undoPendingAction: () => PendingHistoryItem | null;
  redoPendingAction: () => PendingHistoryItem | null;
  clearMediaSelectionState: () => void;
}

const clampZoom = (zoom: number) => Math.min(8, Math.max(0.5, Math.round(zoom * 100) / 100));

const normalizeRange = (start: number, end: number) => ({
  start: Math.max(0, Math.min(start, end)),
  end: Math.max(start, end),
});

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  selectedMediaId: null,
  activeSegmentId: null,
  selectedSegmentId: null,
  timelineZoom: 1,
  playheadDisplayTime: 0,
  followPlayhead: true,
  selectedRange: null,
  currentTool: 'select',
  pendingCutRanges: [],
  pendingCutPoints: [],
  lastActionMessage: '准备就绪',
  undoStack: [],
  redoStack: [],

  setSelectedMediaId: (id) => set({ selectedMediaId: id }),
  setActiveSegmentId: (id) => set({ activeSegmentId: id }),
  setSelectedSegmentId: (id) => set({ selectedSegmentId: id }),
  setTimelineZoom: (zoom) => set({ timelineZoom: clampZoom(zoom) }),
  nudgeTimelineZoom: (delta) => set((state) => ({ timelineZoom: clampZoom(state.timelineZoom + delta) })),
  setPlayheadDisplayTime: (time) => set({ playheadDisplayTime: Math.max(0, time) }),
  setFollowPlayhead: (enabled) => set({ followPlayhead: enabled }),
  setSelectedRange: (range) => set({ selectedRange: range }),
  setCurrentTool: (tool) => set({ currentTool: tool, lastActionMessage: tool === 'blade' ? '切割工具' : '选择工具' }),
  setLastActionMessage: (message) => set({ lastActionMessage: message }),

  addPendingCutPoint: (time) =>
    set((state) => {
      const item: PendingCutPoint = {
        id: `cut_${Date.now()}_${state.pendingCutPoints.length}`,
        time: Math.max(0, time),
      };
      return {
        pendingCutPoints: [...state.pendingCutPoints, item],
        undoStack: [...state.undoStack, { type: 'cutPoint', item }],
        redoStack: [],
        lastActionMessage: `已添加切点 ${item.time.toFixed(2)}s`,
      };
    }),

  addPendingCutRange: (range) =>
    set((state) => {
      const normalized = normalizeRange(range.start, range.end);
      const item: PendingCutRange = {
        ...range,
        ...normalized,
        id: `range_${Date.now()}_${state.pendingCutRanges.length}`,
      };
      return {
        pendingCutRanges: [...state.pendingCutRanges, item],
        selectedRange: normalized,
        selectedSegmentId: item.segmentId ?? state.selectedSegmentId,
        undoStack: [...state.undoStack, { type: 'cutRange', item }],
        redoStack: [],
        lastActionMessage: item.source === 'segment' ? '已标记当前段落删除' : '已标记删除区间',
      };
    }),

  undoPendingAction: () => {
    const state = get();
    const lastAction = state.undoStack[state.undoStack.length - 1] ?? null;

    if (!lastAction) {
      set({ lastActionMessage: '没有可撤销的粗剪占位' });
      return null;
    }

    set((current) => ({
      pendingCutRanges:
        lastAction.type === 'cutRange'
          ? current.pendingCutRanges.filter((item) => item.id !== lastAction.item.id)
          : current.pendingCutRanges,
      pendingCutPoints:
        lastAction.type === 'cutPoint'
          ? current.pendingCutPoints.filter((item) => item.id !== lastAction.item.id)
          : current.pendingCutPoints,
      undoStack: current.undoStack.slice(0, -1),
      redoStack: [...current.redoStack, lastAction],
      lastActionMessage: '已撤销最近一次粗剪占位',
    }));
    return lastAction;
  },

  redoPendingAction: () => {
    const state = get();
    const action = state.redoStack[state.redoStack.length - 1] ?? null;
    if (!action) {
      set({ lastActionMessage: '没有可重做的粗剪占位' });
      return null;
    }

    set((current) => ({
      pendingCutRanges:
        action.type === 'cutRange' ? [...current.pendingCutRanges, action.item] : current.pendingCutRanges,
      pendingCutPoints:
        action.type === 'cutPoint' ? [...current.pendingCutPoints, action.item] : current.pendingCutPoints,
      undoStack: [...current.undoStack, action],
      redoStack: current.redoStack.slice(0, -1),
      lastActionMessage: '已重做粗剪占位',
    }));
    return action;
  },

  clearMediaSelectionState: () =>
    set({
      activeSegmentId: null,
      selectedSegmentId: null,
      playheadDisplayTime: 0,
      selectedRange: null,
      pendingCutRanges: [],
      pendingCutPoints: [],
      undoStack: [],
      redoStack: [],
    }),
}));

import { create } from 'zustand';

export type WorkbenchTool = 'select' | 'blade';
export type CutRangeReason = 'segment-delete' | 'manual-delete';

export interface SelectedRange {
  sourceStart: number;
  sourceEnd: number;
}

export interface CutPoint {
  id: string;
  mediaId: string;
  sourceTime: number;
  createdAt: number;
}

export interface CutRange {
  id: string;
  mediaId: string;
  sourceStart: number;
  sourceEnd: number;
  reason: CutRangeReason;
  segmentIds?: string[];
  createdAt: number;
}

export type HistoryAction =
  | { type: 'add-cut-point'; cutPoint: CutPoint }
  | { type: 'add-cut-range'; cutRange: CutRange }
  | { type: 'remove-cut-range'; cutRange: CutRange };

interface AddCutPointInput {
  mediaId: string;
  sourceTime: number;
}

interface AddCutRangeInput {
  mediaId: string;
  sourceStart: number;
  sourceEnd: number;
  reason: CutRangeReason;
  segmentIds?: string[];
}

interface WorkbenchState {
  selectedMediaId: string | null;
  activeSegmentId: string | null;
  selectedSegmentId: string | null;
  selectedCutRangeId: string | null;
  activeBoundaryId: string | null;
  timelineZoom: number;
  playheadDisplayTime: number;
  followPlayhead: boolean;
  selectedRange: SelectedRange | null;
  currentTool: WorkbenchTool;
  cutPoints: CutPoint[];
  cutRanges: CutRange[];
  undoStack: HistoryAction[];
  redoStack: HistoryAction[];
  lastActionMessage: string;

  setSelectedMediaId: (id: string | null) => void;
  setActiveSegmentId: (id: string | null) => void;
  setSelectedSegmentId: (id: string | null) => void;
  setSelectedCutRangeId: (id: string | null) => void;
  setActiveBoundaryId: (id: string | null) => void;
  setTimelineZoom: (zoom: number) => void;
  nudgeTimelineZoom: (delta: number) => void;
  setPlayheadDisplayTime: (time: number) => void;
  setFollowPlayhead: (enabled: boolean) => void;
  setSelectedRange: (range: SelectedRange | null) => void;
  setCurrentTool: (tool: WorkbenchTool) => void;
  setLastActionMessage: (message: string) => void;
  addCutPoint: (input: AddCutPointInput) => CutPoint;
  addCutRange: (input: AddCutRangeInput) => CutRange;
  removeCutRange: (id: string) => CutRange | null;
  undo: () => HistoryAction | null;
  redo: () => HistoryAction | null;
  clearMediaSelectionState: () => void;
}

const clampZoom = (zoom: number) => Math.min(8, Math.max(0.5, Math.round(zoom * 100) / 100));
const clampTime = (time: number) => Math.max(0, Number.isFinite(time) ? time : 0);

function normalizeRange(start: number, end: number): SelectedRange {
  const safeStart = clampTime(start);
  const safeEnd = clampTime(end);
  return {
    sourceStart: Math.min(safeStart, safeEnd),
    sourceEnd: Math.max(safeStart, safeEnd),
  };
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  selectedMediaId: null,
  activeSegmentId: null,
  selectedSegmentId: null,
  selectedCutRangeId: null,
  activeBoundaryId: null,
  timelineZoom: 1,
  playheadDisplayTime: 0,
  followPlayhead: true,
  selectedRange: null,
  currentTool: 'select',
  cutPoints: [],
  cutRanges: [],
  undoStack: [],
  redoStack: [],
  lastActionMessage: '准备就绪',

  setSelectedMediaId: (id) => set({ selectedMediaId: id }),
  setActiveSegmentId: (id) => set({ activeSegmentId: id }),
  setSelectedSegmentId: (id) => set({ selectedSegmentId: id, selectedCutRangeId: null }),
  setSelectedCutRangeId: (id) => set({ selectedCutRangeId: id, selectedSegmentId: null }),
  setActiveBoundaryId: (id) => set({ activeBoundaryId: id }),
  setTimelineZoom: (zoom) => set({ timelineZoom: clampZoom(zoom) }),
  nudgeTimelineZoom: (delta) => set((state) => ({ timelineZoom: clampZoom(state.timelineZoom + delta) })),
  setPlayheadDisplayTime: (time) => set({ playheadDisplayTime: clampTime(time) }),
  setFollowPlayhead: (enabled) => set({ followPlayhead: enabled }),
  setSelectedRange: (range) => set({ selectedRange: range }),
  setCurrentTool: (tool) =>
    set({
      currentTool: tool,
      selectedRange: null,
      lastActionMessage: tool === 'blade' ? '切割工具' : '选择工具',
    }),
  setLastActionMessage: (message) => set({ lastActionMessage: message }),

  addCutPoint: (input) => {
    const cutPoint: CutPoint = {
      id: createId('cut'),
      mediaId: input.mediaId,
      sourceTime: clampTime(input.sourceTime),
      createdAt: Date.now(),
    };
    set((state) => ({
      cutPoints: [...state.cutPoints, cutPoint],
      undoStack: [...state.undoStack, { type: 'add-cut-point', cutPoint }],
      redoStack: [],
      selectedRange: null,
      selectedCutRangeId: null,
      activeBoundaryId: `manual-cut:${cutPoint.id}`,
      lastActionMessage: `已添加切点 ${cutPoint.sourceTime.toFixed(2)}s`,
    }));
    return cutPoint;
  },

  addCutRange: (input) => {
    const range = normalizeRange(input.sourceStart, input.sourceEnd);
    const cutRange: CutRange = {
      id: createId('range'),
      mediaId: input.mediaId,
      sourceStart: range.sourceStart,
      sourceEnd: range.sourceEnd,
      reason: input.reason,
      segmentIds: input.segmentIds,
      createdAt: Date.now(),
    };
    set((state) => ({
      cutRanges: [...state.cutRanges, cutRange],
      undoStack: [...state.undoStack, { type: 'add-cut-range', cutRange }],
      redoStack: [],
      selectedRange: null,
      selectedCutRangeId: cutRange.id,
      selectedSegmentId: input.segmentIds?.[0] ?? state.selectedSegmentId,
      lastActionMessage: input.reason === 'segment-delete' ? '已标记段落删除' : '已标记删除区间',
    }));
    return cutRange;
  },

  removeCutRange: (id) => {
    const cutRange = get().cutRanges.find((range) => range.id === id) ?? null;
    if (!cutRange) {
      set({ lastActionMessage: '没有找到删除区间' });
      return null;
    }
    set((state) => ({
      cutRanges: state.cutRanges.filter((range) => range.id !== id),
      undoStack: [...state.undoStack, { type: 'remove-cut-range', cutRange }],
      redoStack: [],
      selectedCutRangeId: null,
      lastActionMessage: '已恢复删除区间',
    }));
    return cutRange;
  },

  undo: () => {
    const action = get().undoStack.at(-1) ?? null;
    if (!action) {
      set({ lastActionMessage: '没有可撤销的粗剪操作' });
      return null;
    }

    set((state) => {
      const nextState: Partial<WorkbenchState> = {
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, action],
        lastActionMessage: '已撤销',
      };

      if (action.type === 'add-cut-point') {
        nextState.cutPoints = state.cutPoints.filter((cut) => cut.id !== action.cutPoint.id);
        if (state.activeBoundaryId === `manual-cut:${action.cutPoint.id}`) {
          nextState.activeBoundaryId = null;
        }
      } else if (action.type === 'add-cut-range') {
        nextState.cutRanges = state.cutRanges.filter((range) => range.id !== action.cutRange.id);
        nextState.selectedCutRangeId = null;
      } else {
        nextState.cutRanges = [...state.cutRanges, action.cutRange];
      }

      return nextState;
    });
    return action;
  },

  redo: () => {
    const action = get().redoStack.at(-1) ?? null;
    if (!action) {
      set({ lastActionMessage: '没有可重做的粗剪操作' });
      return null;
    }

    set((state) => {
      const nextState: Partial<WorkbenchState> = {
        undoStack: [...state.undoStack, action],
        redoStack: state.redoStack.slice(0, -1),
        lastActionMessage: '已重做',
      };

      if (action.type === 'add-cut-point') {
        nextState.cutPoints = [...state.cutPoints, action.cutPoint];
      } else if (action.type === 'add-cut-range') {
        nextState.cutRanges = [...state.cutRanges, action.cutRange];
        nextState.selectedCutRangeId = action.cutRange.id;
      } else {
        nextState.cutRanges = state.cutRanges.filter((range) => range.id !== action.cutRange.id);
        nextState.selectedCutRangeId = null;
      }

      return nextState;
    });
    return action;
  },

  clearMediaSelectionState: () =>
    set({
      activeSegmentId: null,
      selectedSegmentId: null,
      selectedCutRangeId: null,
      activeBoundaryId: null,
      playheadDisplayTime: 0,
      selectedRange: null,
      currentTool: 'select',
    }),
}));

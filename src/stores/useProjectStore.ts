import { create } from 'zustand';
import type { Job, Segment } from '../types';

type Page = 'home' | 'lyrics';

interface ProjectState {
  /** 当前页面 */
  page: Page;
  /** 所有任务 */
  jobs: Job[];
  /** 当前选中的任务 */
  activeJobId: string | null;
  /** 每个任务的字幕数据 */
  segmentsMap: Record<string, Segment[]>;

  // 导航
  goHome: () => void;
  goLyrics: (jobId: string) => void;

  // 任务管理
  addJob: (job: Job) => void;
  removeJob: (jobId: string) => void;
  setActiveJob: (jobId: string) => void;

  // 字幕存储
  saveSegments: (jobId: string, segments: Segment[]) => void;
  getSegments: (jobId: string) => Segment[];
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  page: 'home',
  jobs: [],
  activeJobId: null,
  segmentsMap: {},

  goHome: () => set({ page: 'home' }),
  goLyrics: (jobId) => set({ page: 'lyrics', activeJobId: jobId }),

  addJob: (job) =>
    set((s) => ({
      jobs: [...s.jobs, job],
    })),

  removeJob: (jobId) =>
    set((s) => {
      const jobs = s.jobs.filter((j) => j.id !== jobId);
      const segmentsMap = { ...s.segmentsMap };
      delete segmentsMap[jobId];
      return {
        jobs,
        segmentsMap,
        activeJobId: s.activeJobId === jobId ? null : s.activeJobId,
      };
    }),

  setActiveJob: (jobId) => set({ activeJobId: jobId }),

  saveSegments: (jobId, segments) =>
    set((s) => ({
      segmentsMap: { ...s.segmentsMap, [jobId]: segments },
    })),

  getSegments: (jobId) => {
    return get().segmentsMap[jobId] ?? [];
  },
}));

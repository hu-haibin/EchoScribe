import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  /** 每个任务上次播放位置 */
  playbackPositions: Record<string, number>;

  // 导航
  goHome: () => void;
  goLyrics: (jobId: string) => void;

  // 任务管理
  addJob: (job: Job) => void;
  removeJob: (jobId: string) => void;
  setActiveJob: (jobId: string) => void;
  updateJob: (jobId: string, patch: Partial<Job>) => void;
  updateJobMedia: (jobId: string, fileName: string, fileType: string, fileUrl: string) => void;

  // 字幕存储
  saveSegments: (jobId: string, segments: Segment[]) => void;
  getSegments: (jobId: string) => Segment[];

  // 播放位置
  savePlaybackPosition: (jobId: string, time: number) => void;
  getPlaybackPosition: (jobId: string) => number;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      page: 'home',
      jobs: [],
      activeJobId: null,
      segmentsMap: {},
      playbackPositions: {},

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
          const playbackPositions = { ...s.playbackPositions };
          delete segmentsMap[jobId];
          delete playbackPositions[jobId];
          return {
            jobs,
            segmentsMap,
            playbackPositions,
            activeJobId: s.activeJobId === jobId ? null : s.activeJobId,
            page: s.activeJobId === jobId ? 'home' : s.page,
          };
        }),

      setActiveJob: (jobId) => set({ activeJobId: jobId }),

      updateJob: (jobId, patch) =>
        set((s) => ({
          jobs: s.jobs.map((job) =>
            job.id === jobId ? { ...job, ...patch, id: job.id } : job
          ),
        })),

      updateJobMedia: (jobId, fileName, fileType, fileUrl) =>
        set((s) => ({
          jobs: s.jobs.map((job) =>
            job.id === jobId
              ? { ...job, fileName, fileType, fileUrl, mediaAvailable: true, errorMessage: undefined }
              : job
          ),
        })),

      saveSegments: (jobId, segments) =>
        set((s) => ({
          segmentsMap: { ...s.segmentsMap, [jobId]: segments },
        })),

      getSegments: (jobId) => {
        return get().segmentsMap[jobId] ?? [];
      },

      savePlaybackPosition: (jobId, time) =>
        set((s) => ({
          playbackPositions: { ...s.playbackPositions, [jobId]: time },
        })),

      getPlaybackPosition: (jobId) => {
        return get().playbackPositions[jobId] ?? 0;
      },
    }),
    {
      name: 'echoscribe-project-v1',
      partialize: (state) => ({
        page: state.page,
        jobs: state.jobs.map((job) => ({
          ...job,
          fileUrl: '',
          mediaAvailable: false,
        })),
        activeJobId: state.activeJobId,
        segmentsMap: state.segmentsMap,
        playbackPositions: state.playbackPositions,
      }),
    }
  )
);

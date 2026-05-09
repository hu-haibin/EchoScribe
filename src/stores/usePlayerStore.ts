import { create } from 'zustand';
import type { PlaybackRate } from '../types';

interface PlayerState {
  /** 当前播放时间（秒） */
  currentTime: number;
  /** 总时长（秒） */
  duration: number;
  /** 是否播放中 */
  isPlaying: boolean;
  /** 音量 0-1 */
  volume: number;
  /** 倍速 */
  playbackRate: PlaybackRate;
  /** video/audio 元素引用 */
  mediaElement: HTMLMediaElement | null;

  // Actions
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaying: (playing: boolean) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: PlaybackRate) => void;
  setMediaElement: (el: HTMLMediaElement | null) => void;
  seekTo: (time: number) => void;
  togglePlay: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  volume: 0.8,
  playbackRate: 1,
  mediaElement: null,

  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setVolume: (volume) => {
    const el = get().mediaElement;
    if (el) el.volume = volume;
    set({ volume });
  },
  setPlaybackRate: (rate) => {
    const el = get().mediaElement;
    if (el) el.playbackRate = rate;
    set({ playbackRate: rate });
  },
  setMediaElement: (el) => {
    if (el) {
      el.volume = get().volume;
      el.playbackRate = get().playbackRate;
    }
    set({ mediaElement: el });
  },
  seekTo: (time) => {
    const el = get().mediaElement;
    if (el) {
      el.currentTime = time;
      set({ currentTime: time });
    }
  },
  togglePlay: () => {
    const el = get().mediaElement;
    if (!el) return;
    if (el.paused) {
      el.play();
      set({ isPlaying: true });
    } else {
      el.pause();
      set({ isPlaying: false });
    }
  },
}));

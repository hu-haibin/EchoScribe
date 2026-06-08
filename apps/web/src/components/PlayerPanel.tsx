import React, { useRef, useCallback, useEffect } from 'react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { PLAYBACK_RATES } from '../types';

interface PlayerPanelProps {
  fileUrl: string;
  fileType: string;
}

/** 格式化秒数为 mm:ss */
function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const PlayerPanel: React.FC<PlayerPanelProps> = ({ fileUrl, fileType }) => {
  const mediaRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration = usePlayerStore((s) => s.duration);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const setCurrentTime = usePlayerStore((s) => s.setCurrentTime);
  const setDuration = usePlayerStore((s) => s.setDuration);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setMediaElement = usePlayerStore((s) => s.setMediaElement);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  // 注册 media element
  useEffect(() => {
    const el = mediaRef.current;
    if (el) setMediaElement(el);
    return () => setMediaElement(null);
  }, [setMediaElement]);

  // 事件监听
  const onTimeUpdate = useCallback(() => {
    if (mediaRef.current) {
      setCurrentTime(mediaRef.current.currentTime);
    }
  }, [setCurrentTime]);

  const onLoadedMetadata = useCallback(() => {
    if (mediaRef.current) {
      setDuration(mediaRef.current.duration);
    }
  }, [setDuration]);

  const onPlay = useCallback(() => setPlaying(true), [setPlaying]);
  const onPause = useCallback(() => setPlaying(false), [setPlaying]);

  // 进度条点击跳转
  const onProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressRef.current;
      if (!bar || !mediaRef.current) return;
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const time = ratio * duration;
      mediaRef.current.currentTime = time;
      setCurrentTime(time);
    },
    [duration, setCurrentTime]
  );

  const isVideo = fileType.startsWith('video');
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div id="player-panel" className="flex flex-col bg-neutral-900 rounded-xl overflow-hidden">
      {/* 媒体区域 */}
      <div className="relative bg-black flex items-center justify-center" style={{ minHeight: isVideo ? 280 : 120 }}>
        {isVideo ? (
          <video
            ref={mediaRef}
            src={fileUrl}
            className="w-full max-h-[360px] object-contain"
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onLoadedMetadata}
            onPlay={onPlay}
            onPause={onPause}
          />
        ) : (
          <>
            <audio
              ref={mediaRef as React.RefObject<HTMLAudioElement>}
              src={fileUrl}
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={onLoadedMetadata}
              onPlay={onPlay}
              onPause={onPause}
            />
            {/* 纯音频占位 */}
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
              </div>
              <span className="text-neutral-400 text-sm">音频播放中</span>
            </div>
          </>
        )}
      </div>

      {/* 控制条 */}
      <div className="px-4 py-3 space-y-2">
        {/* 进度条 */}
        <div
          ref={progressRef}
          onClick={onProgressClick}
          className="group relative h-1.5 bg-neutral-700 rounded-full cursor-pointer hover:h-2.5 transition-all"
        >
          <div
            className="absolute inset-y-0 left-0 bg-blue-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-blue-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg shadow-blue-500/30"
            style={{ left: `calc(${progress}% - 7px)` }}
          />
        </div>

        {/* 按钮行 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* 播放/暂停 */}
            <button
              id="btn-play-pause"
              onClick={togglePlay}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors"
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* 时间 */}
            <span className="text-xs text-neutral-400 font-mono tabular-nums min-w-[90px]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* 倍速 */}
            <div className="flex items-center gap-1">
              {PLAYBACK_RATES.map((rate) => (
                <button
                  key={rate}
                  onClick={() => setPlaybackRate(rate)}
                  className={`
                    px-2 py-1 text-xs rounded-md transition-all font-mono
                    ${playbackRate === rate
                      ? 'bg-blue-500/20 text-blue-400 font-semibold'
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800'
                    }
                  `}
                >
                  {rate}x
                </button>
              ))}
            </div>

            {/* 音量 */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
                className="text-neutral-400 hover:text-neutral-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  {volume > 0 ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                  )}
                </svg>
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-16 h-1 accent-blue-500 bg-neutral-700 rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-400"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useProjectStore } from '../stores/useProjectStore';
import { PLAYBACK_RATES } from '../types';
import type { PlaybackRate } from '../types';

interface PlayerBarProps {
  jobId: string;
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

export const PlayerBar: React.FC<PlayerBarProps> = ({ jobId, fileUrl, fileType }) => {
  const mediaRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isVideoPreviewCollapsed, setIsVideoPreviewCollapsed] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);

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
  const seekTo = usePlayerStore((s) => s.seekTo);
  const savePlaybackPosition = useProjectStore((s) => s.savePlaybackPosition);
  const getPlaybackPosition = useProjectStore((s) => s.getPlaybackPosition);

  // 注册 media element
  useEffect(() => {
    const el = mediaRef.current;
    if (el) setMediaElement(el);
    return () => setMediaElement(null);
  }, [setMediaElement]);

  // 点击外部关闭倍速菜单
  useEffect(() => {
    if (!showSpeedMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSpeedMenu]);

  const onTimeUpdate = useCallback(() => {
    if (mediaRef.current) {
      setCurrentTime(mediaRef.current.currentTime);
      savePlaybackPosition(jobId, mediaRef.current.currentTime);
    }
  }, [jobId, savePlaybackPosition, setCurrentTime]);

  const onLoadedMetadata = useCallback(() => {
    if (mediaRef.current) {
      setDuration(mediaRef.current.duration);
      const savedPosition = getPlaybackPosition(jobId);
      if (savedPosition > 0 && savedPosition < mediaRef.current.duration) {
        mediaRef.current.currentTime = savedPosition;
        setCurrentTime(savedPosition);
      } else {
        setCurrentTime(0);
      }
    }
  }, [getPlaybackPosition, jobId, setCurrentTime, setDuration]);

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

  // 前进/后退 15 秒
  const skipForward = useCallback(() => {
    seekTo(Math.min(currentTime + 15, duration));
  }, [seekTo, currentTime, duration]);

  const skipBackward = useCallback(() => {
    seekTo(Math.max(currentTime - 15, 0));
  }, [seekTo, currentTime]);

  const selectSpeed = useCallback((rate: PlaybackRate) => {
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
  }, [setPlaybackRate]);

  const isVideo = fileType.startsWith('video');
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div id="player-bar" className="shrink-0 bg-neutral-900/80 backdrop-blur-xl border-t border-neutral-800/60">
      {isVideo ? (
        <div className="border-b border-neutral-800/60 bg-black">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2">
            <div className="min-w-0">
              <p className="text-xs text-neutral-500">视频预览</p>
              {isVideoPreviewCollapsed && (
                <p className="mt-0.5 text-[11px] text-neutral-600">画面已收起，字幕复核和音频同步仍会继续。</p>
              )}
            </div>
            <button
              onClick={() => setIsVideoPreviewCollapsed((collapsed) => !collapsed)}
              className="rounded-md px-2 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
            >
              {isVideoPreviewCollapsed ? '显示画面' : '隐藏画面'}
            </button>
          </div>
          <div className={isVideoPreviewCollapsed ? 'mx-auto max-w-5xl px-4' : 'mx-auto max-h-[240px] max-w-5xl overflow-hidden px-4 pb-3'}>
            <video
              ref={mediaRef}
              src={fileUrl}
              playsInline
              onClick={togglePlay}
              className={
                isVideoPreviewCollapsed
                  ? 'pointer-events-none h-0 w-0 opacity-0'
                  : 'mx-auto aspect-video max-h-[220px] w-full rounded-md bg-black object-contain'
              }
              onTimeUpdate={onTimeUpdate}
              onLoadedMetadata={onLoadedMetadata}
              onPlay={onPlay}
              onPause={onPause}
            />
          </div>
          {isVideoPreviewCollapsed && (
            <div className="mx-auto max-w-5xl px-4 pb-3">
              <div className="flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900/70 px-3 py-2">
                <div>
                  <p className="text-xs font-medium text-neutral-200">视频画面已隐藏</p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">当前仍按音轨播放，点击字幕和时间轴会继续同步。</p>
                </div>
                <button
                  onClick={() => setIsVideoPreviewCollapsed(false)}
                  className="rounded-md bg-neutral-800 px-2.5 py-1.5 text-[11px] text-neutral-200 transition-colors hover:bg-neutral-700"
                >
                  恢复画面
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <audio
          ref={mediaRef as React.RefObject<HTMLAudioElement>}
          src={fileUrl}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onPlay={onPlay}
          onPause={onPause}
        />
      )}

      {/* 进度条 —— 紧贴顶部 */}
      <div
        ref={progressRef}
        onClick={onProgressClick}
        className="group relative h-1 hover:h-2 bg-neutral-800 cursor-pointer transition-all duration-200"
      >
        <div
          className="absolute inset-y-0 left-0 bg-blue-500 transition-all"
          style={{ width: `${progress}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
          style={{ left: `calc(${progress}% - 6px)` }}
        />
      </div>

      {/* 控制行 */}
      <div className="flex items-center justify-between px-6 py-3">
        {/* 左侧：时间 */}
        <div className="flex items-center gap-3 w-40">
          <span className="text-sm text-neutral-400 font-mono tabular-nums">
            {formatTime(currentTime)}
            <span className="text-neutral-600 mx-1">/</span>
            {formatTime(duration)}
          </span>
        </div>

        {/* 中间：后退15s + 播放 + 前进15s */}
        <div className="flex items-center gap-4">
          {/* 后退 15 秒 */}
          <button
            onClick={skipBackward}
            className="w-9 h-9 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
            title="后退 15 秒"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
            <span className="absolute text-[8px] font-bold mt-0.5">15</span>
          </button>

          {/* 播放/暂停 —— 居中大按钮 */}
          <button
            id="btn-play-pause"
            onClick={togglePlay}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-neutral-100 hover:bg-white text-neutral-900 transition-all hover:scale-105 shadow-lg"
          >
            {isPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* 前进 15 秒 */}
          <button
            onClick={skipForward}
            className="w-9 h-9 flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
            title="前进 15 秒"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
            </svg>
            <span className="absolute text-[8px] font-bold mt-0.5">15</span>
          </button>
        </div>

        {/* 右侧：倍速按钮 + 音量 */}
        <div className="flex items-center gap-3 w-40 justify-end">
          {/* 倍速选择器 —— 单按钮 + 弹出菜单 */}
          <div className="relative" ref={speedMenuRef}>
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className={`
                px-2.5 py-1 text-xs rounded-full font-mono transition-all
                ${showSpeedMenu
                  ? 'bg-white/15 text-white'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
                }
              `}
            >
              {playbackRate}x
            </button>

            {/* 弹出菜单 */}
            {showSpeedMenu && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-neutral-800/95 backdrop-blur-xl rounded-xl border border-neutral-700/50 shadow-2xl overflow-hidden animate-fade-in">
                {PLAYBACK_RATES.map((rate) => (
                  <button
                    key={rate}
                    onClick={() => selectSpeed(rate)}
                    className={`
                      block w-full px-5 py-2 text-sm font-mono text-center transition-colors whitespace-nowrap
                      ${playbackRate === rate
                        ? 'bg-blue-600/20 text-blue-400'
                        : 'text-neutral-300 hover:bg-neutral-700/50'
                      }
                    `}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 音量 */}
          <button
            onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
            className="text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
            className="w-20 h-1 bg-neutral-700 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
          />
        </div>
      </div>
    </div>
  );
};

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { useSubtitleStore } from '../../stores/useSubtitleStore';
import { useWorkbenchStore } from '../../stores/useWorkbenchStore';
import type { Job, PlaybackRate, Segment } from '../../types';
import { PLAYBACK_RATES } from '../../types';

interface PlayerPanelProps {
  activeJob: Job | undefined;
  segments: Segment[];
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

export function PlayerPanel({ activeJob, segments }: PlayerPanelProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const lastDisplayCommitRef = useRef(0);

  const duration = usePlayerStore((state) => state.duration);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const volume = usePlayerStore((state) => state.volume);
  const playbackRate = usePlayerStore((state) => state.playbackRate);
  const setDuration = usePlayerStore((state) => state.setDuration);
  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const setMediaElement = usePlayerStore((state) => state.setMediaElement);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const setPlaybackRate = usePlayerStore((state) => state.setPlaybackRate);
  const savePlaybackPosition = useProjectStore((state) => state.savePlaybackPosition);
  const getPlaybackPosition = useProjectStore((state) => state.getPlaybackPosition);
  const getActiveIndex = useSubtitleStore((state) => state.getActiveIndex);
  const playheadDisplayTime = useWorkbenchStore((state) => state.playheadDisplayTime);
  const setPlayheadDisplayTime = useWorkbenchStore((state) => state.setPlayheadDisplayTime);
  const pendingCutRanges = useWorkbenchStore((state) => state.pendingCutRanges);
  const setLastActionMessage = useWorkbenchStore((state) => state.setLastActionMessage);

  const isVideo = Boolean(activeJob?.fileType.startsWith('video'));
  const hasPlayableMedia = Boolean(activeJob?.mediaAvailable && activeJob.fileUrl);
  const progress = duration > 0 ? Math.min(100, (playheadDisplayTime / duration) * 100) : 0;

  const pendingDeletedSegmentIds = useMemo(() => {
    const ids = new Set<string>();
    pendingCutRanges.forEach((range) => {
      if (range.segmentId) ids.add(range.segmentId);
    });
    return ids;
  }, [pendingCutRanges]);

  const activeSubtitle = useMemo(() => {
    const activeIndex = getActiveIndex(playheadDisplayTime);
    if (activeIndex < 0 || activeIndex >= segments.length) return '';
    const segment = segments[activeIndex];
    if (playheadDisplayTime < segment.start || playheadDisplayTime > segment.end) return '';
    if (segment.status === 'delete' || pendingDeletedSegmentIds.has(segment.id)) return '';
    return segment.edited_text;
  }, [getActiveIndex, pendingDeletedSegmentIds, playheadDisplayTime, segments]);

  const commitDisplayTime = useCallback(
    (time: number, force = false) => {
      const now = performance.now();
      if (!force && now - lastDisplayCommitRef.current < 250) return;
      lastDisplayCommitRef.current = now;
      setPlayheadDisplayTime(time);
    },
    [setPlayheadDisplayTime]
  );

  const seekToLocal = useCallback(
    (time: number) => {
      const el = mediaRef.current;
      const nextTime = Math.max(0, Math.min(time, duration || Number.MAX_SAFE_INTEGER));
      if (el) {
        el.currentTime = nextTime;
      }
      commitDisplayTime(nextTime, true);
    },
    [commitDisplayTime, duration]
  );

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) {
      setMediaElement(null);
      return;
    }
    setMediaElement(el);
    return () => setMediaElement(null);
  }, [activeJob?.id, setMediaElement]);

  useEffect(() => {
    commitDisplayTime(0, true);
    setDuration(activeJob?.durationSeconds || 0);
  }, [activeJob?.durationSeconds, activeJob?.id, commitDisplayTime, setDuration]);

  if (!activeJob) {
    return (
      <section className="flex min-h-0 flex-1 flex-col bg-black">
        <div className="flex flex-1 items-center justify-center text-center">
          <div>
            <div className="text-lg font-semibold text-neutral-200">预览</div>
            <div className="mt-2 text-sm text-neutral-500">导入一段口播视频后在这里播放和定位</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-black">
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {hasPlayableMedia ? (
          isVideo ? (
            <video
              ref={(node) => {
                mediaRef.current = node;
              }}
              src={activeJob.fileUrl}
              playsInline
              className="h-full w-full object-contain"
              onClick={togglePlay}
              onTimeUpdate={(event) => commitDisplayTime(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) => {
                const nextDuration = event.currentTarget.duration;
                setDuration(nextDuration);
                const savedPosition = getPlaybackPosition(activeJob.id);
                if (savedPosition > 0 && savedPosition < nextDuration) {
                  event.currentTarget.currentTime = savedPosition;
                  commitDisplayTime(savedPosition, true);
                }
              }}
              onPlay={() => setPlaying(true)}
              onPause={(event) => {
                setPlaying(false);
                savePlaybackPosition(activeJob.id, event.currentTarget.currentTime);
              }}
            />
          ) : (
            <audio
              ref={(node) => {
                mediaRef.current = node;
              }}
              src={activeJob.fileUrl}
              onTimeUpdate={(event) => commitDisplayTime(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) => {
                const nextDuration = event.currentTarget.duration;
                setDuration(nextDuration);
                const savedPosition = getPlaybackPosition(activeJob.id);
                if (savedPosition > 0 && savedPosition < nextDuration) {
                  event.currentTarget.currentTime = savedPosition;
                  commitDisplayTime(savedPosition, true);
                }
              }}
              onPlay={() => setPlaying(true)}
              onPause={(event) => {
                setPlaying(false);
                savePlaybackPosition(activeJob.id, event.currentTarget.currentTime);
              }}
            />
          )
        ) : (
          <div className="text-center">
            <div className="text-sm font-medium text-neutral-300">素材文件需要重新导入</div>
            <div className="mt-1 text-xs text-neutral-600">字幕和项目状态已保留，重新导入同一素材即可继续</div>
          </div>
        )}

        {!isVideo && hasPlayableMedia && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-28 w-28 items-center justify-center rounded-full border border-cyan-400/20 bg-cyan-400/10 text-sm text-cyan-200">
              音频素材
            </div>
          </div>
        )}

        {activeSubtitle && (
          <div className="pointer-events-none absolute bottom-8 left-8 right-8 flex justify-center">
            <span className="max-w-[86%] rounded-md bg-black/70 px-4 py-2 text-center text-base leading-relaxed text-white">
              {activeSubtitle}
            </span>
          </div>
        )}

        {!isPlaying && hasPlayableMedia && (
          <button
            type="button"
            onClick={togglePlay}
            className="absolute flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-2xl text-white backdrop-blur hover:bg-white/20"
            aria-label="播放"
          >
            ▶
          </button>
        )}
      </div>

      <div className="border-t border-neutral-800 bg-neutral-950 px-4 py-3">
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-neutral-800">
          <div className="h-full rounded-full bg-cyan-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <div className="w-36 font-mono text-sm tabular-nums text-neutral-400">
            {formatTime(playheadDisplayTime)}
            <span className="mx-1 text-neutral-700">/</span>
            {formatTime(duration)}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              onClick={() => seekToLocal(playheadDisplayTime - 5)}
            >
              -5s
            </button>
            <button
              type="button"
              className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-white"
              onClick={togglePlay}
            >
              {isPlaying ? '暂停' : '播放'}
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              onClick={() => seekToLocal(playheadDisplayTime + 5)}
            >
              +5s
            </button>
          </div>
          <div className="flex w-36 items-center justify-end gap-2">
            <select
              value={playbackRate}
              onChange={(event) => {
                setPlaybackRate(Number(event.target.value) as PlaybackRate);
                setLastActionMessage('已调整倍速');
              }}
              className="rounded bg-neutral-900 px-1.5 py-1 text-xs text-neutral-400 outline-none hover:bg-neutral-800"
            >
              {PLAYBACK_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}x
                </option>
              ))}
            </select>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(event) => {
                setVolume(Number(event.target.value));
                setLastActionMessage('已调整音量');
              }}
              className="h-1 w-16 cursor-pointer appearance-none rounded-full bg-neutral-700"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

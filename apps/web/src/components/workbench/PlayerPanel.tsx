import { useCallback, useMemo, type SyntheticEvent } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useProjectStore } from '../../stores/useProjectStore';
import { useWorkbenchStore, type CutRange } from '../../stores/useWorkbenchStore';
import type { Job, PlaybackRate, Segment } from '../../types';
import { PLAYBACK_RATES } from '../../types';
import type { PlaybackController } from './usePlaybackController';

interface PlayerPanelProps {
  activeJob: Job | undefined;
  segments: Segment[];
  controller: PlaybackController;
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

function segmentIsDeleted(segment: Segment, ranges: CutRange[], mediaId: string | null): boolean {
  if (segment.status === 'delete') return true;
  return ranges.some((range) => {
    if (range.mediaId !== mediaId) return false;
    if (range.segmentIds?.includes(segment.id)) return true;
    return range.sourceStart <= segment.start && range.sourceEnd >= segment.end;
  });
}

export function PlayerPanel({ activeJob, segments, controller }: PlayerPanelProps) {
  const duration = usePlayerStore((state) => state.duration);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const volume = usePlayerStore((state) => state.volume);
  const playbackRate = usePlayerStore((state) => state.playbackRate);
  const setMediaElement = usePlayerStore((state) => state.setMediaElement);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const setPlaybackRate = usePlayerStore((state) => state.setPlaybackRate);
  const savePlaybackPosition = useProjectStore((state) => state.savePlaybackPosition);
  const getPlaybackPosition = useProjectStore((state) => state.getPlaybackPosition);
  const playheadDisplayTime = useWorkbenchStore((state) => state.playheadDisplayTime);
  const activeSegmentId = useWorkbenchStore((state) => state.activeSegmentId);
  const cutRanges = useWorkbenchStore((state) => state.cutRanges);
  const setLastActionMessage = useWorkbenchStore((state) => state.setLastActionMessage);

  const isVideo = Boolean(activeJob?.fileType.startsWith('video'));
  const hasPlayableMedia = Boolean(activeJob?.mediaAvailable && activeJob.fileUrl);
  const progress = duration > 0 ? Math.min(100, (playheadDisplayTime / duration) * 100) : 0;

  const activeSubtitle = useMemo(() => {
    if (!activeSegmentId) return '';
    const segment = segments.find((item) => item.id === activeSegmentId);
    if (!segment || segmentIsDeleted(segment, cutRanges, activeJob?.id ?? null)) return '';
    return segment.edited_text || segment.raw_text;
  }, [activeJob?.id, activeSegmentId, cutRanges, segments]);

  const bindMediaRef = useCallback(
    (node: HTMLMediaElement | null) => {
      controller.mediaRef.current = node;
      setMediaElement(node);
    },
    [controller.mediaRef, setMediaElement]
  );

  const handleLoadedMetadata = useCallback(
    (event: SyntheticEvent<HTMLMediaElement>) => {
      if (!activeJob) return;
      const nextDuration = event.currentTarget.duration;
      controller.setKnownDuration(nextDuration);
      const savedPosition = getPlaybackPosition(activeJob.id);
      if (savedPosition > 0 && savedPosition < nextDuration) {
        controller.seekTo(savedPosition, { forceDisplay: true });
      } else {
        controller.seekTo(0, { forceDisplay: true });
      }
    },
    [activeJob, controller, getPlaybackPosition]
  );

  const handlePause = useCallback(
    (event: SyntheticEvent<HTMLMediaElement>) => {
      controller.handleMediaPause();
      if (activeJob) {
        savePlaybackPosition(activeJob.id, event.currentTarget.currentTime);
      }
    },
    [activeJob, controller, savePlaybackPosition]
  );

  const seekRelative = useCallback(
    (delta: number) => {
      controller.seekTo(controller.getCurrentTime() + delta, { forceDisplay: true });
    },
    [controller]
  );

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
              ref={bindMediaRef}
              src={activeJob.fileUrl}
              playsInline
              className="h-full w-full object-contain"
              onClick={controller.togglePlay}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={controller.handleMediaPlay}
              onPause={handlePause}
            />
          ) : (
            <audio
              ref={bindMediaRef}
              src={activeJob.fileUrl}
              onLoadedMetadata={handleLoadedMetadata}
              onPlay={controller.handleMediaPlay}
              onPause={handlePause}
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
            onClick={controller.togglePlay}
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
              onClick={() => seekRelative(-5)}
            >
              -5s
            </button>
            <button
              type="button"
              className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-white"
              onClick={controller.togglePlay}
            >
              {isPlaying ? '暂停' : '播放'}
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              onClick={() => seekRelative(5)}
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

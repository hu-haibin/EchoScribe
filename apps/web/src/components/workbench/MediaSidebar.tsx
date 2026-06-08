import { memo, useRef } from 'react';
import { ACCEPTED_MEDIA_EXTENSIONS } from '../../hooks/useMediaImportWorkflow';
import type { Job } from '../../types';

interface MediaSidebarProps {
  jobs: Job[];
  activeJobId: string | null;
  onSelectJob: (jobId: string) => void;
  onImportFiles: (files: File[]) => void;
}

function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function statusLabel(job: Job): string {
  if (job.state === 'pending') return '待识别';
  if (job.state === 'transcribing') return `${job.progress}%`;
  if (job.state === 'error') return '失败';
  return '完成';
}

export const MediaSidebar = memo(function MediaSidebar({
  jobs,
  activeJobId,
  onSelectJob,
  onImportFiles,
}: MediaSidebarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-800 bg-[#101010]">
      <div className="flex h-12 items-center justify-between border-b border-neutral-800 px-3">
        <div>
          <div className="text-sm font-semibold text-neutral-200">素材</div>
          <div className="text-[11px] text-neutral-500">{jobs.length} 个文件</div>
        </div>
        <button
          type="button"
          className="rounded-md bg-neutral-800 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700"
          onClick={() => inputRef.current?.click()}
        >
          导入
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_MEDIA_EXTENSIONS.join(',')}
          className="hidden"
          onChange={(event) => {
            if (event.target.files) {
              onImportFiles(Array.from(event.target.files));
            }
            event.target.value = '';
          }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {jobs.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-neutral-800 px-4 text-center text-xs leading-relaxed text-neutral-500">
            还没有素材
          </div>
        ) : (
          <div className="space-y-1.5">
            {jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => onSelectJob(job.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                  job.id === activeJobId
                    ? 'border-cyan-400/40 bg-cyan-400/10'
                    : 'border-transparent hover:bg-neutral-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-neutral-200">{job.fileName}</span>
                  <span className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                    {statusLabel(job)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-neutral-500">
                  <span>{job.fileType.startsWith('video') ? '视频' : '音频'}</span>
                  <span>{formatDuration(job.durationSeconds)}</span>
                </div>
                {(job.state === 'pending' || job.state === 'transcribing') && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-800">
                    <div className="h-full rounded-full bg-cyan-400" style={{ width: `${job.progress}%` }} />
                  </div>
                )}
                {job.errorMessage && (
                  <div className="mt-1 overflow-hidden text-ellipsis text-[11px] text-red-300">
                    {job.errorMessage}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
});

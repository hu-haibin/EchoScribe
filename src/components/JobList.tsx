import React from 'react';
import { useProjectStore } from '../stores/useProjectStore';

const STATE_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '等待中', color: 'text-neutral-400' },
  transcribing: { label: '转写中', color: 'text-blue-400' },
  done: { label: '已完成', color: 'text-green-400' },
  error: { label: '错误', color: 'text-red-400' },
};

const FILE_ICONS: Record<string, string> = {
  mp4: '🎬',
  mov: '🎬',
  mp3: '🎵',
  wav: '🎵',
  m4a: '🎵',
};

export const JobList: React.FC = () => {
  const jobs = useProjectStore((s) => s.jobs);
  const activeJobId = useProjectStore((s) => s.activeJobId);
  const setActiveJob = useProjectStore((s) => s.setActiveJob);
  const removeJob = useProjectStore((s) => s.removeJob);

  if (jobs.length === 0) return null;

  return (
    <div id="job-list" className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-neutral-800">
        <h3 className="text-sm font-semibold text-neutral-200">任务列表</h3>
      </div>

      <div className="flex-1 overflow-auto px-2 py-2 space-y-1">
        {jobs.map((job) => {
          const ext = job.fileName.split('.').pop()?.toLowerCase() ?? '';
          const icon = FILE_ICONS[ext] || '📄';
          const stateInfo = STATE_MAP[job.state] || STATE_MAP.pending;
          const isActive = job.id === activeJobId;

          return (
            <div
              key={job.id}
              onClick={() => setActiveJob(job.id)}
              className={`
                group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
                transition-all duration-200
                ${isActive
                  ? 'bg-blue-500/10 border border-blue-500/20'
                  : 'hover:bg-neutral-800/50 border border-transparent'
                }
              `}
            >
              <span className="text-lg">{icon}</span>

              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${isActive ? 'text-neutral-100' : 'text-neutral-300'}`}>
                  {job.fileName}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[11px] ${stateInfo.color}`}>{stateInfo.label}</span>
                  {job.state === 'transcribing' && (
                    <div className="flex-1 h-1 bg-neutral-700 rounded-full overflow-hidden max-w-[80px]">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 删除按钮 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeJob(job.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

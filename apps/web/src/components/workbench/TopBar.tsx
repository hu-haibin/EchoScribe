import { ExportMenu } from '../ExportMenu';
import type { Job } from '../../types';

interface TopBarProps {
  activeJob: Job | undefined;
  savedAt: Date | null;
  lastActionMessage: string;
  onUndo: () => void;
  onRedo: () => void;
}

function statusLabel(job: Job | undefined): string {
  if (!job) return '未导入';
  if (job.state === 'pending') return '等待识别';
  if (job.state === 'transcribing') return `识别中 ${job.progress}%`;
  if (job.state === 'error') return '识别失败';
  return '识别完成';
}

export function TopBar({ activeJob, savedAt, lastActionMessage, onUndo, onRedo }: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 text-neutral-200">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-neutral-800 text-xs font-semibold text-neutral-100">
          ES
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{activeJob?.fileName || '未命名口播粗剪'}</div>
          <div className="flex items-center gap-2 text-[11px] text-neutral-500">
            <span>{savedAt ? `已保存 ${savedAt.toLocaleTimeString()}` : '自动保存待命'}</span>
            <span className="text-neutral-700">|</span>
            <span>{statusLabel(activeJob)}</span>
            <span className="text-neutral-700">|</span>
            <span className="truncate">{lastActionMessage}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          onClick={onUndo}
        >
          撤销
        </button>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          onClick={onRedo}
        >
          重做
        </button>
        <ExportMenu />
      </div>
    </header>
  );
}

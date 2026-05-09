import React from 'react';

interface ConfirmDialogProps {
  fileName: string;
  onReplace: () => void;
  onNewTask: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  fileName,
  onReplace,
  onNewTask,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-neutral-900 border border-neutral-700/60 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="px-6 pt-6 pb-2">
          <h3 className="text-base font-semibold text-neutral-100">检测到新文件</h3>
          <p className="text-sm text-neutral-400 mt-1.5 truncate">{fileName}</p>
        </div>

        {/* 选项 */}
        <div className="px-4 py-4 space-y-2">
          <button
            onClick={onReplace}
            className="w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors text-left flex items-center gap-3"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
            </svg>
            <div>
              <p>替换当前文件</p>
              <p className="text-xs text-blue-200/60 font-normal mt-0.5">在当前页面加载新字幕</p>
            </div>
          </button>
          <button
            onClick={onNewTask}
            className="w-full px-4 py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm font-medium transition-colors text-left flex items-center gap-3"
          >
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <div>
              <p>新建任务</p>
              <p className="text-xs text-neutral-400 font-normal mt-0.5">添加到首页文件列表</p>
            </div>
          </button>
        </div>

        {/* 取消 */}
        <div className="px-4 pb-4">
          <button
            onClick={onCancel}
            className="w-full py-2 text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSubtitleStore } from '../stores/useSubtitleStore';
import { downloadFile, exportSRT } from '../utils/exportSRT';
import { exportJSON } from '../utils/exportJSON';
import { exportTXT } from '../utils/exportTXT';

export const ExportMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const segments = useSubtitleStore((state) => state.segments);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleExport = useCallback(
    (type: 'srt' | 'txt' | 'json') => {
      switch (type) {
        case 'srt':
          downloadFile(exportSRT(segments), 'subtitles.srt', 'text/plain;charset=utf-8');
          break;
        case 'txt':
          downloadFile(exportTXT(segments), 'transcript.txt', 'text/plain;charset=utf-8');
          break;
        case 'json':
          downloadFile(exportJSON(segments), 'echoscribe-project.json', 'application/json;charset=utf-8');
          break;
      }
      setOpen(false);
    },
    [segments]
  );

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all ${
          open ? 'bg-cyan-600 text-white' : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-700'
        }`}
      >
        导出
        <svg className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-neutral-700/50 bg-neutral-800/95 shadow-2xl backdrop-blur-xl">
          <div className="p-1">
            <button
              type="button"
              onClick={() => handleExport('srt')}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-700/50"
            >
              <span className="text-sm font-medium text-neutral-200">导出 SRT</span>
              <span className="ml-auto text-xs text-neutral-500">字幕</span>
            </button>
            <button
              type="button"
              onClick={() => handleExport('txt')}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-700/50"
            >
              <span className="text-sm font-medium text-neutral-200">导出 TXT</span>
              <span className="ml-auto text-xs text-neutral-500">文稿</span>
            </button>
            <button
              type="button"
              onClick={() => handleExport('json')}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-700/50"
            >
              <span className="text-sm font-medium text-neutral-200">导出 JSON</span>
              <span className="ml-auto text-xs text-neutral-500">数据</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

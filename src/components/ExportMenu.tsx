import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSubtitleStore } from '../stores/useSubtitleStore';
import { exportSRT, downloadFile } from '../utils/exportSRT';
import { exportTXT } from '../utils/exportTXT';
import { exportJSON } from '../utils/exportJSON';

export const ExportMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const segments = useSubtitleStore((s) => s.segments);

  // 关闭菜单
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleExport = useCallback((type: 'srt' | 'txt' | 'json') => {
    switch (type) {
      case 'srt':
        downloadFile(exportSRT(segments), '字幕导出.srt', 'text/plain;charset=utf-8');
        break;
      case 'txt':
        downloadFile(exportTXT(segments, true), '字幕导出.txt', 'text/plain;charset=utf-8');
        break;
      case 'json':
        downloadFile(exportJSON(segments), '字幕导出.json', 'application/json;charset=utf-8');
        break;
    }
    setOpen(false);
  }, [segments]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`
          px-3 py-1.5 text-xs rounded-lg transition-all flex items-center gap-1.5
          ${open ? 'bg-blue-600 text-white' : 'bg-neutral-800/80 hover:bg-neutral-700 text-neutral-300'}
        `}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
        导出
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-neutral-800/95 backdrop-blur-xl rounded-xl border border-neutral-700/50 shadow-2xl overflow-hidden animate-fade-in z-50">
          <div className="p-1">
            <button
              onClick={() => handleExport('srt')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-700/50 transition-colors text-left"
            >
              <span className="text-sm font-medium text-neutral-200">导出 SRT</span>
              <span className="text-xs text-neutral-500 ml-auto">给剪辑软件</span>
            </button>
            <button
              onClick={() => handleExport('txt')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-700/50 transition-colors text-left"
            >
              <span className="text-sm font-medium text-neutral-200">导出 TXT</span>
              <span className="text-xs text-neutral-500 ml-auto">纯文本</span>
            </button>
            <button
              onClick={() => handleExport('json')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-700/50 transition-colors text-left"
            >
              <span className="text-sm font-medium text-neutral-200">导出 JSON</span>
              <span className="text-xs text-neutral-500 ml-auto">完整数据</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

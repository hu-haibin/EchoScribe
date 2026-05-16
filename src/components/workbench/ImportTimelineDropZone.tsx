import { useRef, useState } from 'react';
import { ACCEPTED_MEDIA_EXTENSIONS } from '../../hooks/useMediaImportWorkflow';

interface ImportTimelineDropZoneProps {
  onImportFiles: (files: File[]) => void;
}

export function ImportTimelineDropZone({ onImportFiles }: ImportTimelineDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      className={`flex h-full min-h-[220px] cursor-pointer items-center justify-center rounded-lg border-2 border-dashed transition-all ${
        isDragOver
          ? 'border-cyan-400 bg-cyan-500/10'
          : 'border-neutral-700 bg-neutral-950/70 hover:border-neutral-500 hover:bg-neutral-900'
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragOver(false);
        onImportFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-500/10 text-2xl text-cyan-300">
          +
        </div>
        <div className="text-lg font-semibold text-neutral-100">拖拽音视频到这里开始</div>
        <div className="mt-2 text-sm text-neutral-500">支持 MP4 / MOV / MKV / MP3 / WAV / M4A / AAC</div>
      </div>
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
  );
}

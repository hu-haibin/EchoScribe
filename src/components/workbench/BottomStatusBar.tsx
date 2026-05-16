interface BottomStatusBarProps {
  lastActionMessage: string;
}

export function BottomStatusBar({ lastActionMessage }: BottomStatusBarProps) {
  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-neutral-800 bg-neutral-950 px-4 text-[11px] text-neutral-500">
      <div className="truncate">
        Space 播放/暂停 ｜ ↑↓ 跳段落 ｜ S 切割 ｜ Delete 删除 ｜ Ctrl+Z 撤销 ｜ Ctrl+滚轮 缩放
      </div>
      <div className="ml-4 shrink-0 text-neutral-400">{lastActionMessage}</div>
    </footer>
  );
}

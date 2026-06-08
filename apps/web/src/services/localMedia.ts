export async function estimateMediaDuration(file: File, fileType: string): Promise<number | undefined> {
  const objectUrl = URL.createObjectURL(file);
  const media = document.createElement(fileType.startsWith('video') ? 'video' : 'audio');

  return new Promise((resolve) => {
    const cleanup = () => {
      media.src = '';
      URL.revokeObjectURL(objectUrl);
    };

    const finish = (duration?: number) => {
      cleanup();
      if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
        resolve(Math.round(duration * 100) / 100);
        return;
      }
      resolve(undefined);
    };

    media.preload = 'metadata';
    media.onloadedmetadata = () => finish(media.duration);
    media.onerror = () => finish(undefined);
    media.src = objectUrl;
  });
}

export async function recreateFileFromObjectUrl(fileUrl: string, fileName: string, fileType: string): Promise<File> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error('无法重新读取当前会话里的本地媒体文件。');
  }

  const blob = await response.blob();
  return new File([blob], fileName, {
    type: blob.type || fileType,
    lastModified: Date.now(),
  });
}

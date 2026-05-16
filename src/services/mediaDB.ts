const DB_NAME = 'echoscribe-media';
const DB_VERSION = 1;
const STORE_NAME = 'files';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Save a media file to IndexedDB, keyed by job ID. */
export async function saveMediaFile(jobId: string, file: File): Promise<void> {
  const db = await openDB();
  const blob = new Blob([await file.arrayBuffer()], { type: file.type });
  const record = { blob, fileName: file.name, fileType: file.type, savedAt: Date.now() };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record, jobId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Load a media file from IndexedDB and return a blob URL + metadata. */
export async function loadMediaFile(
  jobId: string,
): Promise<{ fileUrl: string; fileName: string; fileType: string } | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(jobId);
    request.onsuccess = () => {
      const record = request.result;
      if (!record || !record.blob) {
        resolve(null);
        return;
      }
      const fileUrl = URL.createObjectURL(record.blob);
      resolve({ fileUrl, fileName: record.fileName, fileType: record.fileType });
    };
    request.onerror = () => reject(request.error);
  });
}

/** Remove a media file from IndexedDB. */
export async function removeMediaFile(jobId: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(jobId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

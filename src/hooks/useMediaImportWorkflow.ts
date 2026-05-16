import { useCallback, useRef, useState } from 'react';
import { useProjectStore } from '../stores/useProjectStore';
import { useSubtitleStore } from '../stores/useSubtitleStore';
import { estimateMediaDuration } from '../services/localMedia';
import { saveMediaFile } from '../services/mediaDB';
import {
  CLOUD_ASR_MODEL,
  CLOUD_ASR_PROVIDER,
  DEFAULT_ASR_ALIGNER,
  DEFAULT_ASR_MODEL,
  LOCAL_ASR_PROVIDER,
  transcribeMedia,
  type AsrProvider,
  type TranscriptionProgress,
} from '../services/transcription';
import type { Job } from '../types';

export const ACCEPTED_MEDIA_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.mp3', '.wav', '.m4a', '.aac'];

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm', '.flv', '.wmv']);

export interface ImportSummary {
  added: number;
  skipped: number;
  jobIds: string[];
}

function inferFileType(file: File): string {
  if (file.type) return file.type;
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
  const category = VIDEO_EXTENSIONS.has(ext) ? 'video' : 'audio';
  return `${category}/${ext.slice(1)}`;
}

function isSupportedMedia(file: File): boolean {
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
  return ACCEPTED_MEDIA_EXTENSIONS.includes(ext);
}

export function useMediaImportWorkflow(asrProvider: AsrProvider = 'local') {
  const addJob = useProjectStore((state) => state.addJob);
  const saveSegments = useProjectStore((state) => state.saveSegments);
  const setActiveJob = useProjectStore((state) => state.setActiveJob);
  const updateJob = useProjectStore((state) => state.updateJob);
  const setSegments = useSubtitleStore((state) => state.setSegments);

  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const transcriptionQueueRef = useRef<Promise<void>>(Promise.resolve());

  const hydrateDurationEstimate = useCallback(
    (jobId: string, file: File, fileType: string) => {
      void estimateMediaDuration(file, fileType)
        .then((durationSeconds) => {
          if (durationSeconds) {
            updateJob(jobId, { durationSeconds });
          }
        })
        .catch(() => undefined);
    },
    [updateJob]
  );

  const runTranscription = useCallback(
    async (jobId: string, file: File, provider: AsrProvider) => {
      const isCloud = provider === 'cloud';
      updateJob(jobId, {
        state: 'pending',
        progress: 3,
        progressMessage: isCloud ? 'Uploading to cloud ASR...' : 'Uploading to local ASR...',
        errorMessage: undefined,
        warnings: [],
        asrProvider: isCloud ? CLOUD_ASR_PROVIDER : LOCAL_ASR_PROVIDER,
        asrModel: isCloud ? CLOUD_ASR_MODEL : DEFAULT_ASR_MODEL,
        asrAligner: isCloud ? '' : DEFAULT_ASR_ALIGNER,
      });

      try {
        const result = await transcribeMedia(
          file,
          (progress: TranscriptionProgress) => {
            updateJob(jobId, {
              state: progress.status === 'queued' ? 'pending' : 'transcribing',
              progress: progress.progress,
              progressMessage: progress.message,
              errorMessage: undefined,
            });
          },
          provider
        );

        saveSegments(jobId, result.segments);
        updateJob(jobId, {
          state: 'done',
          progress: 100,
          progressMessage: 'Transcription ready for rough cut.',
          durationSeconds: result.durationSeconds,
          warnings: result.warnings,
          errorMessage: undefined,
          asrProvider: result.provider,
          asrModel: result.model,
          asrAligner: result.aligner,
        });

        if (useProjectStore.getState().activeJobId === jobId) {
          setSegments(result.segments);
        }
      } catch (error) {
        updateJob(jobId, {
          state: 'error',
          progress: 0,
          progressMessage: undefined,
          errorMessage: error instanceof Error ? error.message : 'Transcription failed.',
        });
      }
    },
    [saveSegments, setSegments, updateJob]
  );

  const enqueueTranscription = useCallback(
    (jobId: string, file: File, provider: AsrProvider) => {
      transcriptionQueueRef.current = transcriptionQueueRef.current
        .catch(() => undefined)
        .then(() => runTranscription(jobId, file, provider));
    },
    [runTranscription]
  );

  const createJobFromFile = useCallback(
    (file: File, provider: AsrProvider): { jobId: string; file: File } | null => {
      if (!isSupportedMedia(file)) return null;

      const isCloud = provider === 'cloud';
      const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const fileType = inferFileType(file);
      const job: Job = {
        id: jobId,
        fileName: file.name,
        fileType,
        fileUrl: URL.createObjectURL(file),
        mediaAvailable: true,
        state: 'pending',
        progress: 0,
        progressMessage: 'Waiting to transcribe...',
        asrProvider: isCloud ? CLOUD_ASR_PROVIDER : LOCAL_ASR_PROVIDER,
        asrModel: isCloud ? CLOUD_ASR_MODEL : DEFAULT_ASR_MODEL,
        asrAligner: isCloud ? '' : DEFAULT_ASR_ALIGNER,
      };

      addJob(job);
      saveSegments(jobId, []);
      hydrateDurationEstimate(jobId, file, fileType);
      void saveMediaFile(jobId, file).catch(() => undefined);

      return { jobId, file };
    },
    [addJob, hydrateDurationEstimate, saveSegments]
  );

  const importFiles = useCallback(
    (files: File[]) => {
      const created: Array<{ jobId: string; file: File }> = [];
      let skipped = 0;

      files.forEach((file) => {
        const result = createJobFromFile(file, asrProvider);
        if (result) {
          created.push(result);
        } else {
          skipped += 1;
        }
      });

      const summary: ImportSummary = {
        added: created.length,
        skipped,
        jobIds: created.map((item) => item.jobId),
      };
      setImportSummary(summary);

      if (created.length > 0) {
        setActiveJob(created[0].jobId);
        setSegments([]);
      }

      created.forEach((item) => enqueueTranscription(item.jobId, item.file, asrProvider));
      return summary;
    },
    [asrProvider, createJobFromFile, enqueueTranscription, setActiveJob, setSegments]
  );

  return {
    acceptedExtensions: ACCEPTED_MEDIA_EXTENSIONS,
    importFiles,
    importSummary,
    clearImportSummary: () => setImportSummary(null),
  };
}

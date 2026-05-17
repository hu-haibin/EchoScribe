import { useMemo } from 'react';
import { useWorkbenchStore, type CutRange } from '../../stores/useWorkbenchStore';
import type { Segment } from '../../types';

export type BoundaryKind = 'segment-start' | 'segment-end' | 'manual-cut' | 'silence';

export interface Boundary {
  id: string;
  mediaId: string;
  sourceTime: number;
  kind: BoundaryKind;
  segmentId?: string;
}

interface UseTimelineBoundariesOptions {
  mediaId: string | null;
  segments: Segment[];
}

const BOUNDARY_DEDUPE_SECONDS = 0.08;

export function segmentStartBoundaryId(mediaId: string, segmentId: string): string {
  return `segment-start:${mediaId}:${segmentId}`;
}

function isSegmentCoveredByCutRange(segment: Segment, ranges: CutRange[], mediaId: string): boolean {
  if (segment.status === 'delete') return true;
  return ranges.some((range) => {
    if (range.mediaId !== mediaId) return false;
    if (range.segmentIds?.includes(segment.id)) return true;
    return range.sourceStart <= segment.start && range.sourceEnd >= segment.end;
  });
}

function priority(boundary: Boundary): number {
  if (boundary.kind === 'manual-cut') return 3;
  if (boundary.kind === 'segment-start') return 2;
  return 1;
}

function dedupeBoundaries(boundaries: Boundary[]): Boundary[] {
  const sorted = boundaries
    .slice()
    .sort((a, b) => a.sourceTime - b.sourceTime || priority(b) - priority(a));
  const result: Boundary[] = [];

  sorted.forEach((boundary) => {
    const previous = result[result.length - 1];
    if (!previous || Math.abs(previous.sourceTime - boundary.sourceTime) > BOUNDARY_DEDUPE_SECONDS) {
      result.push(boundary);
      return;
    }

    if (priority(boundary) > priority(previous)) {
      result[result.length - 1] = boundary;
    }
  });

  return result.sort((a, b) => a.sourceTime - b.sourceTime || priority(b) - priority(a));
}

export function useTimelineBoundaries({ mediaId, segments }: UseTimelineBoundariesOptions): Boundary[] {
  const cutPoints = useWorkbenchStore((state) => state.cutPoints);
  const cutRanges = useWorkbenchStore((state) => state.cutRanges);

  return useMemo(() => {
    if (!mediaId) return [];

    const segmentBoundaries: Boundary[] = segments
      .filter((segment) => !isSegmentCoveredByCutRange(segment, cutRanges, mediaId))
      .map((segment) => ({
        id: segmentStartBoundaryId(mediaId, segment.id),
        mediaId,
        sourceTime: segment.start,
        kind: 'segment-start',
        segmentId: segment.id,
      }));

    const manualBoundaries: Boundary[] = cutPoints
      .filter((cutPoint) => cutPoint.mediaId === mediaId)
      .map((cutPoint) => ({
        id: `manual-cut:${cutPoint.id}`,
        mediaId,
        sourceTime: cutPoint.sourceTime,
        kind: 'manual-cut',
      }));

    return dedupeBoundaries([...segmentBoundaries, ...manualBoundaries]);
  }, [cutPoints, cutRanges, mediaId, segments]);
}

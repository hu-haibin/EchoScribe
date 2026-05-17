using FFMpegCore;

namespace KoubojianJi.Services;

public class FFmpegMediaService : IMediaService
{
    public async Task<double> GetDurationAsync(string filePath, CancellationToken ct = default)
    {
        var info = await FFProbe.AnalyseAsync(filePath, cancellationToken: ct);
        return info.Duration.TotalSeconds;
    }

    public async Task ExportTrimmedAsync(
        string inputPath,
        IReadOnlyList<(double Start, double End)> keepRanges,
        string outputPath,
        IProgress<double>? progress = null,
        CancellationToken ct = default)
    {
        if (keepRanges.Count == 0)
            throw new InvalidOperationException("没有可保留的片段。");

        var tempDir = Path.Combine(Path.GetTempPath(), $"kbjj_export_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);

        try
        {
            var tempFiles = new List<string>();
            var ext = Path.GetExtension(inputPath);

            for (int i = 0; i < keepRanges.Count; i++)
            {
                ct.ThrowIfCancellationRequested();
                var (start, end) = keepRanges[i];
                var tempFile = Path.Combine(tempDir, $"part_{i:D4}{ext}");

                await FFMpegArguments
                    .FromFileInput(inputPath, verifyExists: true, options => options
                        .Seek(TimeSpan.FromSeconds(start))
                        .EndSeek(TimeSpan.FromSeconds(end)))
                    .OutputToFile(tempFile, overwrite: true, options => options
                        .CopyChannel())
                    .CancellableThrough(ct)
                    .ProcessAsynchronously();

                tempFiles.Add(tempFile);
                progress?.Report((double)(i + 1) / keepRanges.Count * 90);
            }

            // Concat via demuxer
            var listFile = Path.Combine(tempDir, "concat.txt");
            var lines = tempFiles.Select(f => $"file '{f.Replace("'", "'\\''")}'");
            await File.WriteAllLinesAsync(listFile, lines, ct);

            await FFMpegArguments
                .FromDemuxConcatInput(tempFiles)
                .OutputToFile(outputPath, overwrite: true, options => options
                    .CopyChannel())
                .CancellableThrough(ct)
                .ProcessAsynchronously();

            progress?.Report(100);
        }
        finally
        {
            try { Directory.Delete(tempDir, true); } catch { /* cleanup best-effort */ }
        }
    }

    /// <summary>
    /// Given cut ranges (deletions), compute the inverse: ranges to keep.
    /// </summary>
    public static List<(double Start, double End)> InvertCutRanges(
        IEnumerable<Models.CutRange> cuts, double totalDuration)
    {
        var sorted = cuts.OrderBy(c => c.Start).ToList();
        var kept = new List<(double Start, double End)>();
        double cursor = 0;

        foreach (var cut in sorted)
        {
            if (cut.Start > cursor)
                kept.Add((cursor, cut.Start));
            cursor = Math.Max(cursor, cut.End);
        }

        if (cursor < totalDuration)
            kept.Add((cursor, totalDuration));

        return kept;
    }
}

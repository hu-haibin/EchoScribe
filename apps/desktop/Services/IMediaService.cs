namespace EchoScribe.Desktop.Services;

public interface IMediaService
{
    Task<double> GetDurationAsync(string filePath, CancellationToken ct = default);

    Task ExportTrimmedAsync(
        string inputPath,
        IReadOnlyList<(double Start, double End)> keepRanges,
        string outputPath,
        IProgress<double>? progress = null,
        CancellationToken ct = default);
}

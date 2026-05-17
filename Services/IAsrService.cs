using KoubojianJi.Models;

namespace KoubojianJi.Services;

public interface IAsrService
{
    AsrProvider Provider { get; }
    Task<TranscriptionResult> TranscribeAsync(
        string filePath,
        IProgress<TranscriptionProgress>? progress = null,
        CancellationToken cancellationToken = default);
}

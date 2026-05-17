using System.Text.Json.Serialization;

namespace KoubojianJi.Models;

public class TranscriptionResult
{
    [JsonPropertyName("provider")]
    public string Provider { get; set; } = string.Empty;

    [JsonPropertyName("model")]
    public string Model { get; set; } = string.Empty;

    [JsonPropertyName("aligner")]
    public string Aligner { get; set; } = string.Empty;

    [JsonPropertyName("segments")]
    public List<Segment> Segments { get; set; } = [];

    [JsonPropertyName("fullText")]
    public string FullText { get; set; } = string.Empty;

    [JsonPropertyName("durationSeconds")]
    public double DurationSeconds { get; set; }

    [JsonPropertyName("warnings")]
    public List<string> Warnings { get; set; } = [];
}

public class TranscriptionProgress
{
    public string Status { get; set; } = "queued";
    public double Progress { get; set; }
    public string Message { get; set; } = string.Empty;
    public int? CurrentChunk { get; set; }
    public int? TotalChunks { get; set; }
}

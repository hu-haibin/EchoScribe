using System.Text.Json.Serialization;

namespace KoubojianJi.Models;

public class Segment
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("start")]
    public double Start { get; set; }

    [JsonPropertyName("end")]
    public double End { get; set; }

    [JsonPropertyName("raw_text")]
    public string RawText { get; set; } = string.Empty;

    [JsonPropertyName("edited_text")]
    public string EditedText { get; set; } = string.Empty;

    [JsonPropertyName("speaker")]
    public string? Speaker { get; set; }

    [JsonPropertyName("status")]
    [JsonConverter(typeof(JsonStringEnumConverter<SegmentStatus>))]
    public SegmentStatus Status { get; set; } = SegmentStatus.Review;

    [JsonPropertyName("important")]
    public bool Important { get; set; }

    [JsonPropertyName("needsCheck")]
    public bool NeedsCheck { get; set; }

    public static Segment Normalize(Segment? raw, int index)
    {
        var start = raw?.Start ?? 0;
        var end = raw?.End ?? 0;
        if (!double.IsFinite(start)) start = 0;
        if (!double.IsFinite(end) || end <= start) end = start + 2;

        var text = (raw?.EditedText ?? raw?.RawText ?? "").Trim();

        return new Segment
        {
            Id = !string.IsNullOrEmpty(raw?.Id) ? raw.Id : $"seg_{(index + 1):D4}",
            Start = start,
            End = end,
            RawText = raw?.RawText ?? text,
            EditedText = !string.IsNullOrEmpty(text) ? text : (raw?.RawText ?? ""),
            Speaker = !string.IsNullOrWhiteSpace(raw?.Speaker) ? raw.Speaker.Trim() : null,
            Status = raw?.Status is SegmentStatus.Keep or SegmentStatus.Delete ? raw.Status : SegmentStatus.Review,
            Important = raw?.Important ?? false,
            NeedsCheck = raw?.NeedsCheck ?? false,
        };
    }
}

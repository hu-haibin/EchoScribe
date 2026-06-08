using System.Text.Json.Serialization;

namespace KoubojianJi.Models;

public class CutRange
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];

    [JsonPropertyName("start")]
    public double Start { get; set; }

    [JsonPropertyName("end")]
    public double End { get; set; }

    [JsonPropertyName("reason")]
    [JsonConverter(typeof(JsonStringEnumConverter<CutReason>))]
    public CutReason Reason { get; set; } = CutReason.SegmentDelete;

    [JsonPropertyName("segmentIds")]
    public List<string> SegmentIds { get; set; } = [];
}

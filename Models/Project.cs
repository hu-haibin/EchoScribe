using System.Text.Json.Serialization;

namespace KoubojianJi.Models;

public class Project
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "未命名项目";

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; } = DateTime.Now;

    [JsonPropertyName("jobs")]
    public List<Job> Jobs { get; set; } = [];

    [JsonPropertyName("segmentsMap")]
    public Dictionary<string, List<Segment>> SegmentsMap { get; set; } = [];

    [JsonPropertyName("cutRangesMap")]
    public Dictionary<string, List<CutRange>> CutRangesMap { get; set; } = [];
}

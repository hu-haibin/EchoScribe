using System.Text.Json.Serialization;
using CommunityToolkit.Mvvm.ComponentModel;

namespace KoubojianJi.Models;

public partial class Job : ObservableObject
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N")[..8];

    [JsonPropertyName("fileName")]
    public string FileName { get; set; } = string.Empty;

    [JsonPropertyName("fileType")]
    public string FileType { get; set; } = string.Empty;

    [JsonPropertyName("mediaPath")]
    public string MediaPath { get; set; } = string.Empty;

    [ObservableProperty]
    [property: JsonPropertyName("state")]
    [property: JsonConverter(typeof(JsonStringEnumConverter<JobState>))]
    private JobState _state = JobState.Pending;

    [ObservableProperty]
    [property: JsonPropertyName("progress")]
    private double _progress;

    [ObservableProperty]
    [property: JsonPropertyName("progressMessage")]
    private string? _progressMessage;

    [ObservableProperty]
    [property: JsonPropertyName("errorMessage")]
    private string? _errorMessage;

    [JsonPropertyName("asrProvider")]
    [JsonConverter(typeof(JsonStringEnumConverter<AsrProvider>))]
    public AsrProvider AsrProvider { get; set; } = AsrProvider.Local;

    [JsonPropertyName("asrModel")]
    public string? AsrModel { get; set; }

    [JsonPropertyName("durationSeconds")]
    public double? DurationSeconds { get; set; }

    [JsonPropertyName("warnings")]
    public List<string>? Warnings { get; set; }

    [JsonIgnore]
    public string StateText => State switch
    {
        JobState.Pending => "等待中",
        JobState.Transcribing => "识别中",
        JobState.Done => "已完成",
        JobState.Error => "识别失败",
        _ => ""
    };

    [JsonIgnore]
    public bool IsDone => State == JobState.Done;

    [JsonIgnore]
    public bool IsWorking => State == JobState.Transcribing;

    [JsonIgnore]
    public bool CanRetry => State is JobState.Error or JobState.Pending;

    partial void OnStateChanged(JobState value)
    {
        OnPropertyChanged(nameof(StateText));
        OnPropertyChanged(nameof(IsDone));
        OnPropertyChanged(nameof(IsWorking));
        OnPropertyChanged(nameof(CanRetry));
    }
}

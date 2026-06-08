using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using EchoScribe.Desktop.Models;

namespace EchoScribe.Desktop.Services;

public class CloudAsrService : IAsrService
{
    private readonly HttpClient _http;
    private const string BaseUrl = "http://127.0.0.1:8787";

    public AsrProvider Provider => AsrProvider.Cloud;

    public CloudAsrService(HttpClient? http = null)
    {
        _http = http ?? new HttpClient { BaseAddress = new Uri(BaseUrl), Timeout = TimeSpan.FromHours(1) };
    }

    public async Task<TranscriptionResult> TranscribeAsync(
        string filePath,
        IProgress<TranscriptionProgress>? progress = null,
        CancellationToken ct = default)
    {
        progress?.Report(new TranscriptionProgress { Status = "queued", Progress = 0, Message = "正在上传文件…" });

        var jobId = await UploadFileAsync(filePath, ct);

        if (string.IsNullOrEmpty(jobId))
            throw new InvalidOperationException("云端识别服务没有返回任务编号。");

        progress?.Report(new TranscriptionProgress { Status = "queued", Progress = 100, Message = "上传完成，等待云端识别…" });

        double highWater = 0;
        while (true)
        {
            ct.ThrowIfCancellationRequested();

            var response = await _http.GetAsync($"/transcribe/jobs/{Uri.EscapeDataString(jobId)}", ct);
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync(ct);
            var snapshot = JsonDocument.Parse(json).RootElement;

            var status = TryGetString(snapshot, "status") ?? "transcribing";
            var progressVal = Math.Clamp(TryGetDouble(snapshot, "progress"), 0, 100);
            if (progressVal > highWater) highWater = progressVal;

            var message = (TryGetString(snapshot, "message") ?? "").Trim();
            if (message == "Calling Aliyun Paraformer API.") message = "正在调用阿里云 Paraformer 识别…";
            else if (string.IsNullOrEmpty(message)) message = "云端识别中…";

            progress?.Report(new TranscriptionProgress
            {
                Status = status,
                Progress = Math.Max(progressVal, highWater),
                Message = message,
            });

            if (status == "done")
            {
                var result = snapshot.GetProperty("result");
                return NormalizeResult(result);
            }

            if (status == "error")
            {
                var msg = TryGetString(snapshot, "errorMessage") ?? "云端识别失败。";
                throw new InvalidOperationException(msg);
            }

            await Task.Delay(1500, ct);
        }
    }

    private async Task<string> UploadFileAsync(string filePath, CancellationToken ct)
    {
        using var content = new MultipartFormDataContent();
        var fileStream = File.OpenRead(filePath);
        var streamContent = new StreamContent(fileStream);
        streamContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        content.Add(streamContent, "file", Path.GetFileName(filePath));

        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsync("/transcribe/cloud/jobs", content, ct);
        }
        catch (HttpRequestException)
        {
            throw new InvalidOperationException("云端识别服务没有启动，请先启动 local-asr。");
        }

        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonDocument.Parse(json);
        return TryGetString(doc.RootElement, "jobId") ?? "";
    }

    private static TranscriptionResult NormalizeResult(JsonElement result)
    {
        var segments = new List<Segment>();
        if (result.TryGetProperty("segments", out var segsEl) && segsEl.ValueKind == JsonValueKind.Array)
        {
            int i = 0;
            foreach (var seg in segsEl.EnumerateArray())
            {
                segments.Add(Segment.Normalize(JsonSerializer.Deserialize<Segment>(seg), i++));
            }
        }

        if (segments.Count == 0)
            throw new InvalidOperationException("云端识别服务没有返回可复核的字幕段落。");

        return new TranscriptionResult
        {
            Provider = TryGetString(result, "provider") ?? "aliyun-paraformer",
            Model = TryGetString(result, "model") ?? "paraformer-v2",
            Aligner = TryGetString(result, "aligner") ?? "",
            Segments = segments,
            FullText = TryGetString(result, "fullText") ?? string.Join("", segments.Select(s => s.EditedText)),
            DurationSeconds = TryGetDouble(result, "durationSeconds"),
            Warnings = result.TryGetProperty("warnings", out var w) && w.ValueKind == JsonValueKind.Array
                ? w.EnumerateArray().Select(x => x.GetString() ?? "").ToList()
                : [],
        };
    }

    private static string? TryGetString(JsonElement el, string prop)
        => el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static double TryGetDouble(JsonElement el, string prop)
        => el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetDouble(out var d) ? d : 0;
}

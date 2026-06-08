using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;
using EchoScribe.Desktop.Models;

namespace EchoScribe.Desktop.Services;

public class LocalAsrService : IAsrService
{
    private readonly HttpClient _http;
    private const string BaseUrl = "http://127.0.0.1:8787";

    public AsrProvider Provider => AsrProvider.Local;

    public LocalAsrService(HttpClient? http = null)
    {
        _http = http ?? new HttpClient { BaseAddress = new Uri(BaseUrl), Timeout = TimeSpan.FromHours(1) };
    }

    public async Task<TranscriptionResult> TranscribeAsync(
        string filePath,
        IProgress<TranscriptionProgress>? progress = null,
        CancellationToken ct = default)
    {
        progress?.Report(new TranscriptionProgress { Status = "queued", Progress = 0, Message = "正在上传文件…" });

        var jobId = await UploadFileAsync(filePath, progress, ct);

        if (string.IsNullOrEmpty(jobId))
            throw new InvalidOperationException("识别服务没有返回任务编号。");

        double highWater = 0;
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            var snapshot = await PollJobAsync(jobId, ct);

            var p = NormalizeProgress(snapshot);
            if (p.Progress > highWater) highWater = p.Progress;
            p.Progress = Math.Max(p.Progress, highWater);
            progress?.Report(p);

            if (p.Status == "done")
            {
                var result = snapshot.GetProperty("result");
                return NormalizeResult(result);
            }

            if (p.Status == "error")
            {
                var msg = TryGetString(snapshot, "errorMessage") ?? p.Message ?? "本地识别失败。";
                throw new InvalidOperationException(msg);
            }

            await Task.Delay(1500, ct);
        }
    }

    private async Task<string> UploadFileAsync(string filePath, IProgress<TranscriptionProgress>? progress, CancellationToken ct)
    {
        using var content = new MultipartFormDataContent();
        var fileStream = File.OpenRead(filePath);
        var streamContent = new StreamContent(fileStream);
        streamContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        content.Add(streamContent, "file", Path.GetFileName(filePath));

        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsync("/transcribe/jobs", content, ct);
        }
        catch (HttpRequestException)
        {
            throw new InvalidOperationException("本地识别服务没有启动，请先启动 local-asr。");
        }

        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync(ct);
        var doc = JsonDocument.Parse(json);

        progress?.Report(new TranscriptionProgress { Status = "queued", Progress = 100, Message = "上传完成，等待识别…" });

        return TryGetString(doc.RootElement, "jobId") ?? "";
    }

    private async Task<JsonElement> PollJobAsync(string jobId, CancellationToken ct)
    {
        var response = await _http.GetAsync($"/transcribe/jobs/{Uri.EscapeDataString(jobId)}", ct);
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync(ct);
        return JsonDocument.Parse(json).RootElement;
    }

    private static TranscriptionProgress NormalizeProgress(JsonElement payload)
    {
        var status = TryGetString(payload, "status") ?? "transcribing";
        if (status is not ("done" or "error" or "queued")) status = "transcribing";

        var progressVal = Math.Clamp(TryGetDouble(payload, "progress"), 0, 100);
        var message = LocalizeMessage(payload, status);
        var currentChunk = TryGetInt(payload, "currentChunk");
        var totalChunks = TryGetInt(payload, "totalChunks");

        return new TranscriptionProgress
        {
            Status = status,
            Progress = progressVal,
            Message = message,
            CurrentChunk = currentChunk,
            TotalChunks = totalChunks,
        };
    }

    private static string LocalizeMessage(JsonElement payload, string status)
    {
        var raw = (TryGetString(payload, "message") ?? "").Trim();
        var currentChunk = TryGetInt(payload, "currentChunk");
        var totalChunks = TryGetInt(payload, "totalChunks");
        var chunkLabel = currentChunk.HasValue && totalChunks.HasValue && totalChunks > 1
            ? $"第 {currentChunk}/{totalChunks} 段" : null;

        if (string.IsNullOrEmpty(raw))
        {
            if (status == "queued") return "已加入识别队列。";
            if (chunkLabel != null) return $"{chunkLabel} 识别中…";
            return "正在识别…";
        }

        return raw switch
        {
            "Queued locally, waiting for the transcription worker." => "已加入识别队列。",
            "Preparing media for local transcription." => "正在准备本地识别任务…",
            "Preparing media for cloud transcription." => "正在准备云端识别任务…",
            "Calling Aliyun Paraformer API." => "正在调用阿里云 Paraformer 识别…",
            "Extracting audio from the video file." => "正在从视频中提取音频…",
            "Reading media duration." => "正在读取媒体时长…",
            "Inspecting media and preparing chunks." => "正在分析文件并准备分段…",
            "Finalizing subtitle segments." => "正在整理最终字幕段落…",
            "Merging chunk subtitles into the final timeline." => "正在合并所有分段字幕…",
            "Running speaker diarization." => "正在区分不同说话人…",
            "Transcription ready for review." => "识别完成，可以开始复核。",
            "Primary model hit GPU memory limits, retrying with the fallback model." => "1.7B 模型显存不足，正在切换到 0.6B 重试…",
            "Transcription failed." => "识别失败。",
            "Preparing subtitle segments." => "正在整理字幕段落…",
            _ => MatchPatterns(raw, chunkLabel, status)
        };
    }

    private static string MatchPatterns(string raw, string? chunkLabel, string status)
    {
        var splitMatch = Regex.Match(raw, @"^Split long media into (\d+) chunks\.$");
        if (splitMatch.Success) return $"长文件将拆成 {splitMatch.Groups[1].Value} 段顺序识别。";

        var transcribingMatch = Regex.Match(raw, @"^Transcribing chunk (\d+)/(\d+)\.$");
        if (transcribingMatch.Success) return $"正在识别第 {transcribingMatch.Groups[1].Value}/{transcribingMatch.Groups[2].Value} 段…";

        if (raw == "Chunk finished, preparing subtitle segments." && chunkLabel != null)
            return $"{chunkLabel} 已完成，正在整理字幕…";

        if (chunkLabel != null && status == "transcribing") return $"{chunkLabel} 识别中…";
        if (status == "queued") return "已加入本地识别队列。";
        return raw;
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
            throw new InvalidOperationException("识别服务没有返回可复核的字幕段落。");

        return new TranscriptionResult
        {
            Provider = TryGetString(result, "provider") ?? "local-qwen3-asr",
            Model = TryGetString(result, "model") ?? "Qwen/Qwen3-ASR-1.7B",
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

    private static int? TryGetInt(JsonElement el, string prop)
        => el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var i) ? i : null;
}

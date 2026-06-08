using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using EchoScribe.Desktop.Models;
using EchoScribe.Desktop.Services;

namespace EchoScribe.Desktop.ViewModels;

public partial class HomeViewModel : ViewModelBase
{
    private readonly Func<Task>? _autoSave;

    [ObservableProperty]
    private AsrProvider _selectedProvider = AsrProvider.Local;

    [ObservableProperty]
    private bool _isTranscribing;

    public ObservableCollection<Job> Jobs { get; }
    public Project Project { get; }

    public event Action<Job, string>? OpenLyricsRequested;
    public event Action<Job, string>? OpenWorkbenchRequested;

    public HomeViewModel(Project project, Func<Task>? autoSave = null)
    {
        Project = project;
        _autoSave = autoSave;
        Jobs = new ObservableCollection<Job>(project.Jobs);
    }

    [RelayCommand]
    private async Task ImportFileAsync()
    {
        var topLevel = Avalonia.Application.Current?.ApplicationLifetime
            is Avalonia.Controls.ApplicationLifetimes.IClassicDesktopStyleApplicationLifetime desktop
            ? desktop.MainWindow : null;

        if (topLevel == null) return;

        var files = await topLevel.StorageProvider.OpenFilePickerAsync(
            new Avalonia.Platform.Storage.FilePickerOpenOptions
            {
                Title = "导入音视频文件",
                AllowMultiple = true,
                FileTypeFilter =
                [
                    new Avalonia.Platform.Storage.FilePickerFileType("音视频文件")
                    {
                        Patterns = ["*.mp4", "*.mov", "*.mkv", "*.mp3", "*.wav", "*.m4a", "*.aac", "*.flac"]
                    }
                ]
            });

        foreach (var file in files)
        {
            await AddAndTranscribeAsync(file.Path.LocalPath, file.Name);
        }
    }

    [RelayCommand]
    private async Task ImportFromPathAsync(string filePath)
    {
        var fileName = Path.GetFileName(filePath);
        await AddAndTranscribeAsync(filePath, fileName);
    }

    private async Task AddAndTranscribeAsync(string filePath, string fileName)
    {
        // Check if already imported
        if (Project.Jobs.Any(j => j.MediaPath == filePath))
        {
            return;
        }

        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        var isVideo = ext is ".mp4" or ".mov" or ".mkv";

        var job = new Job
        {
            FileName = fileName,
            FileType = isVideo ? "video" : "audio",
            MediaPath = filePath,
            AsrProvider = SelectedProvider,
        };

        Project.Jobs.Add(job);
        Jobs.Add(job);

        // Auto-save after import
        if (_autoSave != null) await _autoSave();

        await StartTranscriptionAsync(job);
    }

    [RelayCommand]
    private async Task RetryTranscriptionAsync(Job job)
    {
        if (job.State == JobState.Transcribing) return;
        await StartTranscriptionAsync(job);
    }

    private async Task StartTranscriptionAsync(Job job)
    {
        if (job.State == JobState.Transcribing) return;

        job.State = JobState.Transcribing;
        job.Progress = 0;
        job.ProgressMessage = "正在连接识别服务…";
        job.ErrorMessage = null;
        IsTranscribing = true;

        var sw = System.Diagnostics.Stopwatch.StartNew();
        var service = AsrServiceFactory.Create(job.AsrProvider);
        var progress = new Progress<TranscriptionProgress>(p =>
        {
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                job.Progress = p.Progress;
                job.ProgressMessage = p.Message;
            });
        });

        try
        {
            var result = await service.TranscribeAsync(job.MediaPath, progress);
            sw.Stop();
            var elapsed = sw.Elapsed;
            var timeStr = elapsed.TotalMinutes >= 1
                ? $"{elapsed.Minutes}分{elapsed.Seconds}秒"
                : $"{elapsed.TotalSeconds:F1}秒";
            job.State = JobState.Done;
            job.ProgressMessage = $"识别完成 · {result.Segments.Count} 段字幕 · 耗时 {timeStr}";
            job.DurationSeconds = result.DurationSeconds;
            job.AsrModel = result.Model;
            job.Warnings = result.Warnings;
            Project.SegmentsMap[job.Id] = result.Segments;

            // Auto-save after transcription completes
            if (_autoSave != null) await _autoSave();
        }
        catch (Exception ex)
        {
            job.State = JobState.Error;
            job.ErrorMessage = ex.Message;
            job.ProgressMessage = null;
        }
        finally
        {
            IsTranscribing = false;
        }
    }

    [RelayCommand]
    private void OpenLyrics(Job job)
    {
        if (job.State != JobState.Done) return;
        OpenLyricsRequested?.Invoke(job, job.MediaPath);
    }

    [RelayCommand]
    private void OpenWorkbench(Job job)
    {
        if (job.State != JobState.Done) return;
        OpenWorkbenchRequested?.Invoke(job, job.MediaPath);
    }
}

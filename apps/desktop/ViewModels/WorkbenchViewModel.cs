using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using EchoScribe.Desktop.Models;
using EchoScribe.Desktop.Services;

namespace EchoScribe.Desktop.ViewModels;

public partial class WorkbenchViewModel : ViewModelBase
{
    private readonly Job _job;
    private readonly Project _project;
    private readonly IMediaService _mediaService = new FFmpegMediaService();

    [ObservableProperty]
    private WorkbenchTool _currentTool = WorkbenchTool.Select;

    [ObservableProperty]
    private double _timelineZoom = 1.0;

    [ObservableProperty]
    private int _activeSegmentIndex = -1;

    [ObservableProperty]
    private bool _isExporting;

    [ObservableProperty]
    private double _exportProgress;

    public ObservableCollection<Segment> Segments { get; }
    public ObservableCollection<CutRange> CutRanges { get; }
    public PlayerViewModel Player { get; }
    public string Title => _job.FileName;

    private readonly Stack<HistoryAction> _undoStack = new();
    private readonly Stack<HistoryAction> _redoStack = new();

    public bool CanUndo => _undoStack.Count > 0;
    public bool CanRedo => _redoStack.Count > 0;

    public event Action? GoBackRequested;

    public WorkbenchViewModel(Job job, Project project, PlayerViewModel player)
    {
        _job = job;
        _project = project;
        Player = player;

        var segs = project.SegmentsMap.TryGetValue(job.Id, out var s) ? s : [];
        Segments = new ObservableCollection<Segment>(segs);

        var cuts = project.CutRangesMap.TryGetValue(job.Id, out var c) ? c : [];
        CutRanges = new ObservableCollection<CutRange>(cuts);

        Player.PropertyChanged += (_, e) =>
        {
            if (e.PropertyName == nameof(PlayerViewModel.CurrentTime))
                UpdateActiveSegment(Player.CurrentTime);
        };
    }

    public void Initialize()
    {
        Player.LoadMedia(_job.MediaPath);
    }

    private void UpdateActiveSegment(double time)
    {
        int lo = 0, hi = Segments.Count - 1;
        while (lo <= hi)
        {
            int mid = (lo + hi) / 2;
            var seg = Segments[mid];
            if (time < seg.Start) hi = mid - 1;
            else if (time >= seg.End) lo = mid + 1;
            else { ActiveSegmentIndex = mid; return; }
        }
        ActiveSegmentIndex = -1;
    }

    [RelayCommand]
    private void MarkSegment(Segment segment)
    {
        var oldStatus = segment.Status;
        segment.Status = segment.Status switch
        {
            SegmentStatus.Review => SegmentStatus.Keep,
            SegmentStatus.Keep => SegmentStatus.Delete,
            SegmentStatus.Delete => SegmentStatus.Review,
            _ => SegmentStatus.Review
        };

        PushUndo(new ChangeStatusAction(segment.Id, oldStatus, segment.Status));
        SyncCutRangesFromSegments();
        OnPropertyChanged(nameof(Segments));
    }

    [RelayCommand]
    private void AddCutRange(CutRange range)
    {
        CutRanges.Add(range);
        PushUndo(new AddCutRangeAction(range));
        SyncProjectCutRanges();
    }

    [RelayCommand]
    private void RemoveCutRange(CutRange range)
    {
        CutRanges.Remove(range);
        PushUndo(new RemoveCutRangeAction(range));
        SyncProjectCutRanges();
    }

    [RelayCommand]
    private void Undo()
    {
        if (_undoStack.Count == 0) return;
        var action = _undoStack.Pop();
        action.Undo(this);
        _redoStack.Push(action);
        OnPropertyChanged(nameof(CanUndo));
        OnPropertyChanged(nameof(CanRedo));
    }

    [RelayCommand]
    private void Redo()
    {
        if (_redoStack.Count == 0) return;
        var action = _redoStack.Pop();
        action.Redo(this);
        _undoStack.Push(action);
        OnPropertyChanged(nameof(CanUndo));
        OnPropertyChanged(nameof(CanRedo));
    }

    [RelayCommand]
    private void ZoomIn() => TimelineZoom = Math.Min(8, TimelineZoom * 1.5);

    [RelayCommand]
    private void ZoomOut() => TimelineZoom = Math.Max(0.5, TimelineZoom / 1.5);

    [RelayCommand]
    private async Task ExportAsync()
    {
        var topLevel = Avalonia.Application.Current?.ApplicationLifetime
            is Avalonia.Controls.ApplicationLifetimes.IClassicDesktopStyleApplicationLifetime desktop
            ? desktop.MainWindow : null;
        if (topLevel == null) return;

        var file = await topLevel.StorageProvider.SaveFilePickerAsync(
            new Avalonia.Platform.Storage.FilePickerSaveOptions
            {
                Title = "导出视频",
                SuggestedFileName = $"{Path.GetFileNameWithoutExtension(_job.FileName)}_剪辑{Path.GetExtension(_job.FileName)}",
                DefaultExtension = Path.GetExtension(_job.FileName).TrimStart('.'),
            });

        if (file == null) return;

        IsExporting = true;
        ExportProgress = 0;

        try
        {
            var totalDuration = Player.Duration;
            var keepRanges = FFmpegMediaService.InvertCutRanges(CutRanges, totalDuration);
            var progress = new Progress<double>(p =>
                Avalonia.Threading.Dispatcher.UIThread.Post(() => ExportProgress = p));

            await _mediaService.ExportTrimmedAsync(_job.MediaPath, keepRanges, file.Path.LocalPath, progress);
        }
        catch (Exception ex)
        {
            // TODO: show error dialog
            System.Diagnostics.Debug.WriteLine($"Export error: {ex.Message}");
        }
        finally
        {
            IsExporting = false;
        }
    }

    [RelayCommand]
    private void GoBack()
    {
        SyncProjectSegments();
        SyncProjectCutRanges();
        Player.Stop();
        GoBackRequested?.Invoke();
    }

    private void SyncCutRangesFromSegments()
    {
        // Rebuild cut ranges from segments marked as Delete
        var deletedSegments = Segments.Where(s => s.Status == SegmentStatus.Delete).ToList();
        CutRanges.Clear();
        foreach (var seg in deletedSegments)
        {
            CutRanges.Add(new CutRange
            {
                Start = seg.Start,
                End = seg.End,
                Reason = CutReason.SegmentDelete,
                SegmentIds = [seg.Id],
            });
        }
        SyncProjectCutRanges();
    }

    private void SyncProjectSegments()
    {
        _project.SegmentsMap[_job.Id] = [.. Segments];
    }

    private void SyncProjectCutRanges()
    {
        _project.CutRangesMap[_job.Id] = [.. CutRanges];
    }

    private void PushUndo(HistoryAction action)
    {
        _undoStack.Push(action);
        _redoStack.Clear();
        OnPropertyChanged(nameof(CanUndo));
        OnPropertyChanged(nameof(CanRedo));
    }

    // --- History Actions ---

    private abstract record HistoryAction
    {
        public abstract void Undo(WorkbenchViewModel vm);
        public abstract void Redo(WorkbenchViewModel vm);
    }

    private sealed record ChangeStatusAction(string SegmentId, SegmentStatus OldStatus, SegmentStatus NewStatus) : HistoryAction
    {
        public override void Undo(WorkbenchViewModel vm)
        {
            var seg = vm.Segments.FirstOrDefault(s => s.Id == SegmentId);
            if (seg != null) { seg.Status = OldStatus; vm.SyncCutRangesFromSegments(); vm.OnPropertyChanged(nameof(Segments)); }
        }
        public override void Redo(WorkbenchViewModel vm)
        {
            var seg = vm.Segments.FirstOrDefault(s => s.Id == SegmentId);
            if (seg != null) { seg.Status = NewStatus; vm.SyncCutRangesFromSegments(); vm.OnPropertyChanged(nameof(Segments)); }
        }
    }

    private sealed record AddCutRangeAction(CutRange Range) : HistoryAction
    {
        public override void Undo(WorkbenchViewModel vm) { vm.CutRanges.Remove(Range); vm.SyncProjectCutRanges(); }
        public override void Redo(WorkbenchViewModel vm) { vm.CutRanges.Add(Range); vm.SyncProjectCutRanges(); }
    }

    private sealed record RemoveCutRangeAction(CutRange Range) : HistoryAction
    {
        public override void Undo(WorkbenchViewModel vm) { vm.CutRanges.Add(Range); vm.SyncProjectCutRanges(); }
        public override void Redo(WorkbenchViewModel vm) { vm.CutRanges.Remove(Range); vm.SyncProjectCutRanges(); }
    }
}

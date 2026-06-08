using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using EchoScribe.Desktop.Models;

namespace EchoScribe.Desktop.ViewModels;

public partial class LyricsViewModel : ViewModelBase
{
    private readonly Job _job;
    private readonly Project _project;
    private readonly List<Segment> _rawSegments;

    [ObservableProperty]
    private int _activeIndex = -1;

    public ObservableCollection<LyricLineViewModel> Lines { get; }
    public PlayerViewModel Player { get; }
    public string Title => _job.FileName;

    public event Action? GoBackRequested;

    public LyricsViewModel(Job job, Project project, PlayerViewModel player)
    {
        _job = job;
        _project = project;
        Player = player;

        _rawSegments = project.SegmentsMap.TryGetValue(job.Id, out var s) ? s : [];
        Lines = new ObservableCollection<LyricLineViewModel>(
            _rawSegments.Select((seg, i) => new LyricLineViewModel(seg, i)));

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
        var index = BinarySearchSegment(time);
        if (index != ActiveIndex)
        {
            ActiveIndex = index;
            foreach (var line in Lines)
                line.UpdateDistance(index);
        }
    }

    private int BinarySearchSegment(double time)
    {
        int lo = 0, hi = _rawSegments.Count - 1;
        while (lo <= hi)
        {
            int mid = (lo + hi) / 2;
            var seg = _rawSegments[mid];
            if (time < seg.Start) hi = mid - 1;
            else if (time >= seg.End) lo = mid + 1;
            else return mid;
        }
        return -1;
    }

    [RelayCommand]
    private void SeekToLine(LyricLineViewModel line)
    {
        Player.SeekToCommand.Execute(line.Segment.Start);
        if (!Player.IsPlaying)
            Player.TogglePlayCommand.Execute(null);
    }

    [RelayCommand]
    private void ToggleStatus(LyricLineViewModel line)
    {
        var seg = line.Segment;
        seg.Status = seg.Status switch
        {
            SegmentStatus.Review => SegmentStatus.Keep,
            SegmentStatus.Keep => SegmentStatus.Delete,
            SegmentStatus.Delete => SegmentStatus.Review,
            _ => SegmentStatus.Review
        };
        line.IsDeleted = seg.Status == SegmentStatus.Delete;

        if (_project.SegmentsMap.TryGetValue(_job.Id, out var segs))
        {
            var idx = segs.FindIndex(s => s.Id == seg.Id);
            if (idx >= 0) segs[idx] = seg;
        }
    }

    [RelayCommand]
    private void GoBack()
    {
        Player.Stop();
        GoBackRequested?.Invoke();
    }
}

using CommunityToolkit.Mvvm.ComponentModel;
using EchoScribe.Desktop.Models;

namespace EchoScribe.Desktop.ViewModels;

public partial class LyricLineViewModel : ObservableObject
{
    public Segment Segment { get; }
    public int Index { get; }

    [ObservableProperty]
    private bool _isActive;

    [ObservableProperty]
    private double _opacity = 0.2;

    [ObservableProperty]
    private bool _isDeleted;

    public string Text => Segment.EditedText;
    public string? Speaker => Segment.Speaker;
    public string TimeCode
    {
        get
        {
            var ts = TimeSpan.FromSeconds(Math.Max(0, Segment.Start));
            return ts.ToString(@"mm\:ss");
        }
    }

    public LyricLineViewModel(Segment segment, int index)
    {
        Segment = segment;
        Index = index;
        IsDeleted = segment.Status == SegmentStatus.Delete;
    }

    public void UpdateDistance(int activeIndex)
    {
        int distance = activeIndex < 0 ? -1 : Math.Abs(Index - activeIndex);
        IsActive = distance == 0;
        Opacity = distance switch
        {
            0 => 1.0,
            1 => 0.6,
            2 => 0.4,
            3 => 0.3,
            _ when distance < 0 => 0.5, // no active
            _ => 0.2,
        };
    }
}

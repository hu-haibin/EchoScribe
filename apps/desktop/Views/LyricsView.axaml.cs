using Avalonia;
using Avalonia.Controls;
using Avalonia.Interactivity;
using Avalonia.Threading;
using EchoScribe.Desktop.ViewModels;

namespace EchoScribe.Desktop.Views;

public partial class LyricsView : UserControl
{
    private ScrollViewer? _scroller;
    private double _startY;
    private double _targetY;
    private DateTime _animStartTime;
    private bool _animating;
    private bool _userScrolling;
    private System.Threading.Timer? _returnTimer;

    private const double RowHeight = 72;
    private const double AnimDurationMs = 500;
    private const double ReturnDelayMs = 3000; // 3秒无操作后回到播放行

    public LyricsView()
    {
        InitializeComponent();
    }

    protected override void OnLoaded(RoutedEventArgs e)
    {
        base.OnLoaded(e);
        _scroller = this.FindControl<ScrollViewer>("LyricsScroller");

        if (_scroller != null)
        {
            _scroller.PointerWheelChanged += (_, _) => OnUserScroll();

            // Size spacers once viewport is known
            _scroller.PropertyChanged += (_, args) =>
            {
                if (args.Property == ScrollViewer.ViewportProperty)
                    UpdateSpacers();
            };
        }

        // Initial sizing
        Dispatcher.UIThread.Post(UpdateSpacers, DispatcherPriority.Loaded);
    }

    private void UpdateSpacers()
    {
        if (_scroller == null) return;
        var h = _scroller.Viewport.Height;
        if (h <= 0) return;

        var spacerHeight = (h / 2) - (RowHeight / 2);
        if (spacerHeight < 0) spacerHeight = 0;

        var top = this.FindControl<Border>("TopSpacer");
        var bottom = this.FindControl<Border>("BottomSpacer");
        if (top != null) top.Height = spacerHeight;
        if (bottom != null) bottom.Height = spacerHeight;
    }

    private void OnUserScroll()
    {
        _userScrolling = true;

        // Reset timer: 3s after last scroll → auto return
        _returnTimer?.Dispose();
        _returnTimer = new System.Threading.Timer(_ =>
        {
            Dispatcher.UIThread.Post(() =>
            {
                _userScrolling = false;
                // Snap back to current playing line
                if (DataContext is LyricsViewModel vm && vm.ActiveIndex >= 0)
                    ScrollToCenter(vm.ActiveIndex);
            });
        }, null, (int)ReturnDelayMs, System.Threading.Timeout.Infinite);
    }

    protected override void OnDataContextChanged(EventArgs e)
    {
        base.OnDataContextChanged(e);

        if (DataContext is LyricsViewModel vm)
        {
            vm.PropertyChanged += (_, args) =>
            {
                if (args.PropertyName == nameof(LyricsViewModel.ActiveIndex))
                {
                    if (!_userScrolling)
                        Dispatcher.UIThread.Post(() => ScrollToCenter(vm.ActiveIndex));
                }
            };
        }
    }

    private void ScrollToCenter(int index)
    {
        if (index < 0 || _scroller == null) return;

        var viewportH = _scroller.Viewport.Height;
        if (viewportH <= 0) return;

        var spacerH = (viewportH / 2) - (RowHeight / 2);
        if (spacerH < 0) spacerH = 0;

        // Target: item center at viewport center
        // Item top in content = spacerH + index * RowHeight
        // Item center = spacerH + index * RowHeight + RowHeight/2
        // Scroll offset = item center - viewport/2
        var itemCenter = spacerH + (index * RowHeight) + (RowHeight / 2);
        var newTarget = itemCenter - (viewportH / 2);
        newTarget = Math.Clamp(newTarget, 0, Math.Max(0, _scroller.Extent.Height - viewportH));

        _startY = _scroller.Offset.Y;
        _targetY = newTarget;
        _animStartTime = DateTime.UtcNow;

        if (!_animating)
        {
            _animating = true;
            AnimateStep();
        }
    }

    private static double EaseOutCubic(double t)
    {
        t = 1 - t;
        return 1 - t * t * t;
    }

    private void AnimateStep()
    {
        if (_scroller == null) { _animating = false; return; }

        double elapsed = (DateTime.UtcNow - _animStartTime).TotalMilliseconds;
        double progress = Math.Clamp(elapsed / AnimDurationMs, 0, 1);
        double eased = EaseOutCubic(progress);

        double y = _startY + (_targetY - _startY) * eased;
        _scroller.Offset = new Vector(0, y);

        if (progress >= 1)
        {
            _animating = false;
            return;
        }

        Dispatcher.UIThread.Post(AnimateStep, DispatcherPriority.Render);
    }

    private void OnLyricTapped(object? sender, RoutedEventArgs e)
    {
        if (DataContext is LyricsViewModel vm && sender is Border { Tag: LyricLineViewModel line })
        {
            _userScrolling = false;
            vm.SeekToLineCommand.Execute(line);
        }
    }
}

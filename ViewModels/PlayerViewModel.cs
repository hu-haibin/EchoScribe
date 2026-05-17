using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using LibVLCSharp.Shared;

namespace KoubojianJi.ViewModels;

public partial class PlayerViewModel : ViewModelBase, IDisposable
{
    private readonly LibVLCSharp.Shared.LibVLC _libVlc;
    private readonly bool _audioOnly;

    private LibVLCSharp.Shared.MediaPlayer? _mediaPlayer;
    public LibVLCSharp.Shared.MediaPlayer? MediaPlayer
    {
        get => _mediaPlayer;
        set => SetProperty(ref _mediaPlayer, value);
    }

    [ObservableProperty]
    private double _currentTime;

    [ObservableProperty]
    private double _duration;

    [ObservableProperty]
    private bool _isPlaying;

    [ObservableProperty]
    private double _volume = 0.8;

    [ObservableProperty]
    private double _playbackRate = 1.0;

    public static double[] PlaybackRates => [0.75, 1, 1.25, 1.5, 2];

    private System.Threading.Timer? _positionTimer;

    public PlayerViewModel(bool audioOnly = false)
    {
        _audioOnly = audioOnly;
        _libVlc = audioOnly
            ? new LibVLC("--no-video")
            : new LibVLC();
        MediaPlayer = new MediaPlayer(_libVlc);
        MediaPlayer.EndReached += (_, _) =>
            Avalonia.Threading.Dispatcher.UIThread.Post(() => IsPlaying = false);
    }

    public void LoadMedia(string filePath)
    {
        var media = new Media(_libVlc, filePath, FromType.FromPath);
        MediaPlayer?.Stop();
        MediaPlayer!.Media = media;

        _ = Task.Run(async () =>
        {
            await media.Parse();
            Avalonia.Threading.Dispatcher.UIThread.Post(() =>
            {
                Duration = media.Duration / 1000.0;
            });
        });

        StartPositionTimer();
    }

    [RelayCommand]
    private void TogglePlay()
    {
        if (MediaPlayer == null) return;

        if (IsPlaying)
        {
            MediaPlayer.Pause();
            IsPlaying = false;
        }
        else
        {
            MediaPlayer.Play();
            IsPlaying = true;
        }
    }

    [RelayCommand]
    private void SeekTo(double seconds)
    {
        if (MediaPlayer == null || Duration <= 0) return;
        MediaPlayer.SeekTo(TimeSpan.FromSeconds(Math.Clamp(seconds, 0, Duration)));
        CurrentTime = seconds;
    }

    partial void OnVolumeChanged(double value)
    {
        if (MediaPlayer != null)
            MediaPlayer.Volume = (int)(value * 100);
    }

    partial void OnPlaybackRateChanged(double value)
    {
        if (MediaPlayer != null)
            MediaPlayer.SetRate((float)value);
    }

    private void StartPositionTimer()
    {
        _positionTimer?.Dispose();
        _positionTimer = new System.Threading.Timer(_ =>
        {
            if (MediaPlayer != null && IsPlaying)
            {
                Avalonia.Threading.Dispatcher.UIThread.Post(() =>
                {
                    CurrentTime = MediaPlayer.Time / 1000.0;
                });
            }
        }, null, 0, 50);
    }

    public void Stop()
    {
        MediaPlayer?.Stop();
        IsPlaying = false;
    }

    public void Dispose()
    {
        _positionTimer?.Dispose();
        MediaPlayer?.Dispose();
        _libVlc.Dispose();
        GC.SuppressFinalize(this);
    }
}

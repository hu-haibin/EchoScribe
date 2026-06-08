using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using KoubojianJi.Models;
using KoubojianJi.Services;

namespace KoubojianJi.ViewModels;

public partial class MainWindowViewModel : ViewModelBase
{
    private Project _project = new();
    private readonly IProjectRepository _repository = new JsonProjectRepository();
    private PlayerViewModel? _activePlayer;
    private string? _userProjectFilePath;

    private static readonly string AutoSavePath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "KoubojianJi", "autosave.kbjj");

    [ObservableProperty]
    private ViewModelBase _currentView;

    [ObservableProperty]
    private string _windowTitle = "口播剪辑";

    public MainWindowViewModel()
    {
        _currentView = CreateHomeViewModel();
    }

    public async Task LoadAutoSaveAsync()
    {
        try
        {
            if (File.Exists(AutoSavePath))
            {
                var loaded = await _repository.LoadAsync(AutoSavePath);
                _project = loaded;
                CurrentView = CreateHomeViewModel();
            }
        }
        catch
        {
            _project = new Project();
            CurrentView = CreateHomeViewModel();
        }
    }

    public async Task AutoSaveAsync()
    {
        try
        {
            await _repository.SaveAsync(AutoSavePath, _project);
        }
        catch
        {
            // best-effort
        }
    }

    private HomeViewModel CreateHomeViewModel()
    {
        var home = new HomeViewModel(_project, AutoSaveAsync);
        home.OpenLyricsRequested += (job, _) => NavigateToLyrics(job);
        home.OpenWorkbenchRequested += (job, _) => NavigateToWorkbench(job);
        return home;
    }

    private async void NavigateToLyrics(Job job)
    {
        DisposeActivePlayer();
        WindowTitle = $"歌词模式 - {job.FileName}";

        var player = await Task.Run(() => new PlayerViewModel(audioOnly: true));
        _activePlayer = player;

        var lyrics = new LyricsViewModel(job, _project, player);
        lyrics.GoBackRequested += () => NavigateHome();
        lyrics.Initialize();
        CurrentView = lyrics;
    }

    private async void NavigateToWorkbench(Job job)
    {
        DisposeActivePlayer();
        WindowTitle = $"剪辑工作台 - {job.FileName}";

        var player = await Task.Run(() => new PlayerViewModel(audioOnly: false));
        _activePlayer = player;

        var workbench = new WorkbenchViewModel(job, _project, player);
        workbench.GoBackRequested += () => NavigateHome();
        workbench.Initialize();
        CurrentView = workbench;
    }

    private void NavigateHome()
    {
        DisposeActivePlayer();
        _ = AutoSaveAsync();
        CurrentView = CreateHomeViewModel();
        WindowTitle = "口播剪辑";
    }

    private void DisposeActivePlayer()
    {
        _activePlayer?.Stop();
        _activePlayer?.Dispose();
        _activePlayer = null;
    }

    [RelayCommand]
    private async Task SaveProjectAsync()
    {
        var topLevel = Avalonia.Application.Current?.ApplicationLifetime
            is Avalonia.Controls.ApplicationLifetimes.IClassicDesktopStyleApplicationLifetime desktop
            ? desktop.MainWindow : null;
        if (topLevel == null) return;

        if (_userProjectFilePath == null)
        {
            var file = await topLevel.StorageProvider.SaveFilePickerAsync(
                new Avalonia.Platform.Storage.FilePickerSaveOptions
                {
                    Title = "保存项目",
                    SuggestedFileName = $"{_project.Name}.kbjj",
                    DefaultExtension = "kbjj",
                });
            if (file == null) return;
            _userProjectFilePath = file.Path.LocalPath;
        }

        await _repository.SaveAsync(_userProjectFilePath, _project);
    }

    [RelayCommand]
    private async Task OpenProjectAsync()
    {
        var topLevel = Avalonia.Application.Current?.ApplicationLifetime
            is Avalonia.Controls.ApplicationLifetimes.IClassicDesktopStyleApplicationLifetime desktop
            ? desktop.MainWindow : null;
        if (topLevel == null) return;

        var files = await topLevel.StorageProvider.OpenFilePickerAsync(
            new Avalonia.Platform.Storage.FilePickerOpenOptions
            {
                Title = "打开项目",
                AllowMultiple = false,
                FileTypeFilter =
                [
                    new Avalonia.Platform.Storage.FilePickerFileType("口播剪辑项目") { Patterns = ["*.kbjj"] }
                ]
            });

        if (files.Count == 0) return;

        _userProjectFilePath = files[0].Path.LocalPath;
        var loaded = await _repository.LoadAsync(_userProjectFilePath);
        _project = loaded;

        NavigateHome();
        WindowTitle = $"口播剪辑 - {_project.Name}";
    }
}

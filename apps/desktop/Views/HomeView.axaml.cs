using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Platform.Storage;
using EchoScribe.Desktop.Models;
using EchoScribe.Desktop.ViewModels;

namespace EchoScribe.Desktop.Views;

public partial class HomeView : UserControl
{
    private static readonly HashSet<string> SupportedExtensions =
        [".mp4", ".mov", ".mkv", ".mp3", ".wav", ".m4a", ".aac", ".flac"];

    public HomeView()
    {
        InitializeComponent();

        AddHandler(DragDrop.DropEvent, OnDrop);
        AddHandler(DragDrop.DragOverEvent, OnDragOver);
    }

    private void OnProviderChanged(object? sender, SelectionChangedEventArgs e)
    {
        if (DataContext is HomeViewModel vm && sender is ComboBox combo)
        {
            vm.SelectedProvider = combo.SelectedIndex == 0 ? AsrProvider.Local : AsrProvider.Cloud;
        }
    }

    private void OnDragOver(object? sender, DragEventArgs e)
    {
        e.DragEffects = e.DataTransfer.Contains(DataFormat.File)
            ? DragDropEffects.Copy
            : DragDropEffects.None;
        e.Handled = true;
    }

    private void OnDrop(object? sender, DragEventArgs e)
    {
        if (DataContext is not HomeViewModel vm) return;
        if (!e.DataTransfer.Contains(DataFormat.File)) return;

        var values = e.DataTransfer.TryGetValues<IStorageItem>(DataFormat.File);
        if (values == null) return;

        foreach (var storageItem in values)
        {
            if (storageItem is IStorageFile file && IsSupported(file.Name))
            {
                vm.ImportFromPathCommand.Execute(file.Path.LocalPath);
            }
        }

        e.Handled = true;
    }

    private static bool IsSupported(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return SupportedExtensions.Contains(ext);
    }
}

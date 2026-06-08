using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using EchoScribe.Desktop.ViewModels;
using EchoScribe.Desktop.Views;

namespace EchoScribe.Desktop;

public partial class App : Application
{
    public override void Initialize()
    {
        AvaloniaXamlLoader.Load(this);
    }

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            try
            {
                var vm = new MainWindowViewModel();
                Console.Error.WriteLine("[OK] ViewModel created");

                var win = new MainWindow { DataContext = vm };
                Console.Error.WriteLine("[OK] Window created");

                desktop.MainWindow = win;
                win.Show();
                Console.Error.WriteLine("[OK] Window shown");

                _ = vm.LoadAutoSaveAsync();
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[CRASH] {ex}");
                throw;
            }
        }

        base.OnFrameworkInitializationCompleted();
    }
}

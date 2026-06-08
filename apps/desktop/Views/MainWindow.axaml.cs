using Avalonia.Controls;
using Avalonia.Interactivity;

namespace KoubojianJi.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private void OnExitClick(object? sender, RoutedEventArgs e)
    {
        Close();
    }
}

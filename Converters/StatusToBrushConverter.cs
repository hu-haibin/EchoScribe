using System.Globalization;
using Avalonia.Data.Converters;
using Avalonia.Media;
using KoubojianJi.Models;

namespace KoubojianJi.Converters;

public class StatusToBrushConverter : IValueConverter
{
    public static readonly StatusToBrushConverter Instance = new();

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return value switch
        {
            SegmentStatus.Keep => new SolidColorBrush(Color.FromRgb(76, 175, 80)),   // green
            SegmentStatus.Delete => new SolidColorBrush(Color.FromRgb(244, 67, 54)), // red
            _ => new SolidColorBrush(Color.FromRgb(158, 158, 158)),                  // grey
        };
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

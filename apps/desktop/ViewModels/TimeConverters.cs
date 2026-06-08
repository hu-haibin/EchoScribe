using System.Globalization;
using Avalonia.Data.Converters;

namespace KoubojianJi.ViewModels;

public static class TimeConverters
{
    public static readonly IValueConverter SecondsToTimeSpan =
        new FuncValueConverter<double, TimeSpan>(s => TimeSpan.FromSeconds(Math.Max(0, s)));

    public static readonly IValueConverter SecondsToTimeString =
        new FuncValueConverter<double, string>(s =>
        {
            var ts = TimeSpan.FromSeconds(Math.Max(0, s));
            return ts.ToString(@"mm\:ss", CultureInfo.InvariantCulture);
        });
}

using EchoScribe.Desktop.Models;

namespace EchoScribe.Desktop.Services;

public static class AsrServiceFactory
{
    private static readonly LocalAsrService LocalInstance = new();
    private static readonly CloudAsrService CloudInstance = new();

    public static IAsrService Create(AsrProvider provider) => provider switch
    {
        AsrProvider.Local => LocalInstance,
        AsrProvider.Cloud => CloudInstance,
        _ => throw new ArgumentOutOfRangeException(nameof(provider))
    };
}

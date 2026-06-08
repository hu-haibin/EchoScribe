using System.Text.Json;
using KoubojianJi.Models;

namespace KoubojianJi.Services;

public class JsonProjectRepository : IProjectRepository
{
    private static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
    };

    public async Task<Project> LoadAsync(string filePath, CancellationToken ct = default)
    {
        var json = await File.ReadAllTextAsync(filePath, ct);
        return JsonSerializer.Deserialize<Project>(json, Options)
               ?? throw new InvalidOperationException("项目文件格式无效。");
    }

    public async Task SaveAsync(string filePath, Project project, CancellationToken ct = default)
    {
        var dir = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        var json = JsonSerializer.Serialize(project, Options);
        await File.WriteAllTextAsync(filePath, json, ct);
    }
}

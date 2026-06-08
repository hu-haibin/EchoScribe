using EchoScribe.Desktop.Models;

namespace EchoScribe.Desktop.Services;

public interface IProjectRepository
{
    Task<Project> LoadAsync(string filePath, CancellationToken ct = default);
    Task SaveAsync(string filePath, Project project, CancellationToken ct = default);
}

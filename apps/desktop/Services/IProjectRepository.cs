using KoubojianJi.Models;

namespace KoubojianJi.Services;

public interface IProjectRepository
{
    Task<Project> LoadAsync(string filePath, CancellationToken ct = default);
    Task SaveAsync(string filePath, Project project, CancellationToken ct = default);
}

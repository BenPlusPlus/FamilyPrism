using System.IO.Compression;
using System.Security.Cryptography;
using prismshared;

namespace prismshared.tests;

public class ClientUpdateStagerTests
{
    [Fact]
    public void HashMismatch_DeletesStagingAndKeepsTheInstall()
    {
        using var workspace = new UpdateTestWorkspace();
        workspace.WriteInstallFile("marker.txt", "current");
        var zipPath = workspace.CreatePackageZip(("marker.txt", "updated"));

        var result = ClientUpdateStager.Stage(zipPath, new string('0', 64), workspace.Paths.StagingDirectory);

        Assert.IsType<ClientUpdateStageResult.HashMismatch>(result);
        Assert.False(File.Exists(zipPath));
        Assert.False(Directory.Exists(workspace.Paths.StagingDirectory));
        Assert.Equal("current", File.ReadAllText(workspace.InstallFile("marker.txt")));
    }

    [Fact]
    public void MatchingHash_ExtractsThePackageIntoStaging()
    {
        using var workspace = new UpdateTestWorkspace();
        var zipPath = workspace.CreatePackageZip(
            ("marker.txt", "updated"),
            (PrismConstants.UpdateHelperExecutableName, "helper"));
        var hash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(zipPath)));

        var result = ClientUpdateStager.Stage(zipPath, hash, workspace.Paths.StagingDirectory);

        Assert.IsType<ClientUpdateStageResult.Ready>(result);
        Assert.Equal("updated", File.ReadAllText(Path.Combine(workspace.Paths.StagingDirectory, "marker.txt")));
        Assert.True(File.Exists(workspace.Paths.HelperExecutablePath));
    }
}

internal sealed class UpdateTestWorkspace : IDisposable
{
    public UpdateTestWorkspace()
    {
        Root = Path.Combine(Path.GetTempPath(), "FamilyPrismUpdateTests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Root);
        Paths = new ClientUpdatePaths(
            Path.Combine(Root, "updates"),
            Path.Combine(Root, "install"));
        Directory.CreateDirectory(Paths.InstallDirectory);
        Directory.CreateDirectory(Paths.UpdatesDirectory);
    }

    public string Root { get; }

    public ClientUpdatePaths Paths { get; }

    public string InstallFile(string relativePath) => Path.Combine(Paths.InstallDirectory, relativePath);

    public void WriteInstallFile(string relativePath, string content)
    {
        var path = InstallFile(relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, content);
    }

    public void WriteStagingFile(string relativePath, string content)
    {
        var path = Path.Combine(Paths.StagingDirectory, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, content);
    }

    public string CreatePackageZip(params (string Name, string Content)[] files)
    {
        var zipPath = Path.Combine(Root, "package.zip");
        using var archive = ZipFile.Open(zipPath, ZipArchiveMode.Create);
        foreach (var (name, content) in files)
        {
            var entry = archive.CreateEntry(name.Replace('\\', '/'));
            using var writer = new StreamWriter(entry.Open());
            writer.Write(content);
        }

        return zipPath;
    }

    public void Dispose()
    {
        try
        {
            if (Directory.Exists(Root))
            {
                Directory.Delete(Root, recursive: true);
            }
        }
        catch
        {
        }
    }
}

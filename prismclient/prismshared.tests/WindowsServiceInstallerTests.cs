using prismshared;

namespace prismshared.tests;

public class WindowsServiceInstallerTests
{
    [Fact]
    public void TreatsServiceFolderCasingAsTheSamePath()
    {
        using var workspace = new ServiceCopyWorkspace();
        var bundled = Path.Combine(workspace.Root, "service");
        var installed = Path.Combine(workspace.Root, "Service");
        Directory.CreateDirectory(bundled);
        File.WriteAllText(Path.Combine(bundled, "appsettings.json"), "installed");

        Assert.True(WindowsServiceInstaller.IsSamePath(bundled, installed));
        Assert.True(WindowsServiceInstaller.IsSamePath(bundled + Path.DirectorySeparatorChar, installed));
        Assert.False(WindowsServiceInstaller.IsSamePath(bundled, Path.Combine(workspace.Root, "bundled")));
    }

    [Fact]
    public void SkipsCopyWhenBundledAndInstalledAreTheSameDirectory()
    {
        using var workspace = new ServiceCopyWorkspace();
        var bundled = Path.Combine(workspace.Root, "service");
        var installed = Path.Combine(workspace.Root, "Service");
        Directory.CreateDirectory(bundled);
        var settingsPath = Path.Combine(bundled, "appsettings.json");
        File.WriteAllText(settingsPath, "original");

        WindowsServiceInstaller.CopyServiceFiles(bundled, installed);

        Assert.Equal("original", File.ReadAllText(settingsPath));
        Assert.Single(Directory.GetFiles(bundled));
    }

    [Fact]
    public void CopiesAndOverwritesWhenBundledAndInstalledAreDifferentDirectories()
    {
        using var workspace = new ServiceCopyWorkspace();
        var bundled = Path.Combine(workspace.Root, "bundled");
        var installed = Path.Combine(workspace.Root, "Service");
        Directory.CreateDirectory(bundled);
        Directory.CreateDirectory(Path.Combine(bundled, "nested"));
        Directory.CreateDirectory(installed);
        File.WriteAllText(Path.Combine(bundled, "appsettings.json"), "from-bundle");
        File.WriteAllText(Path.Combine(bundled, "nested", "extra.txt"), "nested");
        File.WriteAllText(Path.Combine(installed, "appsettings.json"), "old");

        WindowsServiceInstaller.CopyServiceFiles(bundled, installed);

        Assert.Equal("from-bundle", File.ReadAllText(Path.Combine(installed, "appsettings.json")));
        Assert.Equal("nested", File.ReadAllText(Path.Combine(installed, "nested", "extra.txt")));
        Assert.Equal("from-bundle", File.ReadAllText(Path.Combine(bundled, "appsettings.json")));
    }
}

file sealed class ServiceCopyWorkspace : IDisposable
{
    public ServiceCopyWorkspace()
    {
        Root = Path.Combine(Path.GetTempPath(), "FamilyPrismServiceCopyTests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Root);
    }

    public string Root { get; }

    public void Dispose()
    {
        if (Directory.Exists(Root))
        {
            Directory.Delete(Root, recursive: true);
        }
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using prismshared;

namespace prismshared.tests;

public class ClientUpdateCoordinatorTests
{
    private static readonly ClientUpdateEligibility Eligible = new(
        UsesMachineScope: true,
        IsWindowsServiceHost: true,
        BinariesAreInstalledLayout: true,
        IsConfigured: true,
        HasPendingSetup: false);

    [Fact]
    public async Task DebugAndNonInstallHostsNeverDownloadOrSwap()
    {
        using var workspace = new UpdateTestWorkspace();
        var downloader = new RecordingDownloader();
        var launcher = new RecordingLauncher();
        var stopped = false;
        var handler = new CountingHandler(Package());

        var coordinator = CreateCoordinator(
            workspace,
            handler,
            downloader,
            launcher,
            () => stopped = true,
            Eligible with { UsesMachineScope = false, IsWindowsServiceHost = false, BinariesAreInstalledLayout = false });

        var outcome = await coordinator.CheckAsync(Configuration(), CancellationToken.None);

        Assert.Equal(ClientUpdateOutcome.Skipped, outcome);
        Assert.Equal(0, handler.RequestCount);
        Assert.Equal(0, downloader.DownloadCount);
        Assert.False(launcher.Started);
        Assert.False(stopped);
    }

    [Fact]
    public async Task SameOrOlderPinDoesNotDownloadTheZip()
    {
        using var workspace = new UpdateTestWorkspace();
        var downloader = new RecordingDownloader();
        var launcher = new RecordingLauncher();
        var stopped = false;

        var coordinator = new ClientUpdateCoordinator(
            new PrismApiClient(new HttpClient(new CountingHandler(Package()))),
            workspace.Paths,
            () => Eligible,
            () => "0.2.0",
            downloader,
            launcher,
            () => stopped = true);

        var outcome = await coordinator.CheckAsync(Configuration(), CancellationToken.None);

        Assert.Equal(ClientUpdateOutcome.Skipped, outcome);
        Assert.Equal(0, downloader.DownloadCount);
        Assert.False(launcher.Started);
        Assert.False(stopped);
    }

    [Fact]
    public async Task HashMismatch_DeletesStagingAndLeavesTheInstallRunning()
    {
        using var workspace = new UpdateTestWorkspace();
        workspace.WriteInstallFile("marker.txt", "current");
        var zipPath = workspace.CreatePackageZip(
            ("marker.txt", "updated"),
            (PrismConstants.UpdateHelperExecutableName, "helper"));
        var package = Package(sha256: new string('0', 64));
        var launcher = new RecordingLauncher();
        var stopped = false;

        var coordinator = CreateCoordinator(
            workspace,
            new CountingHandler(package),
            new CopyDownloader(zipPath),
            launcher,
            () => stopped = true,
            Eligible);

        var outcome = await coordinator.CheckAsync(Configuration(), CancellationToken.None);

        Assert.Equal(ClientUpdateOutcome.HashMismatch, outcome);
        Assert.False(launcher.Started);
        Assert.False(stopped);
        Assert.False(Directory.Exists(workspace.Paths.StagingDirectory));
        Assert.False(File.Exists(workspace.Paths.PackageZipPath));
        Assert.Equal("current", File.ReadAllText(workspace.InstallFile("marker.txt")));
    }

    [Fact]
    public async Task FailedPinIsNotDownloadedUntilThePinChanges()
    {
        using var workspace = new UpdateTestWorkspace();
        var package = Package();
        ClientUpdateStateStore.Write(
            workspace.Paths.StatePath,
            new ClientUpdateState(FailedVersion: package.Version, FailedSha256: package.Sha256));

        var downloader = new RecordingDownloader();
        var coordinator = CreateCoordinator(
            workspace,
            new CountingHandler(package),
            downloader,
            new RecordingLauncher(),
            () => { },
            Eligible);

        var outcome = await coordinator.CheckAsync(Configuration(), CancellationToken.None);

        Assert.Equal(ClientUpdateOutcome.Skipped, outcome);
        Assert.Equal(0, downloader.DownloadCount);

        var changed = Package(sha256: new string('c', 64));
        var zipPath = workspace.CreatePackageZip(
            ("marker.txt", "updated"),
            (PrismConstants.UpdateHelperExecutableName, "helper"));
        var hash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(zipPath))).ToLowerInvariant();
        changed = Package(sha256: hash);
        var launcher = new RecordingLauncher();
        var stopped = false;
        var applyCoordinator = CreateCoordinator(
            workspace,
            new CountingHandler(changed),
            new CopyDownloader(zipPath),
            launcher,
            () => stopped = true,
            Eligible);

        var applyOutcome = await applyCoordinator.CheckAsync(Configuration(), CancellationToken.None);

        Assert.Equal(ClientUpdateOutcome.StagedAndRestarting, applyOutcome);
        Assert.True(launcher.Started);
        Assert.True(stopped);
        Assert.Contains("--plan", launcher.Arguments, StringComparison.Ordinal);
    }

    [Fact]
    public async Task GreaterVerifiedZipStagesTheHelperAndStopsTheService()
    {
        using var workspace = new UpdateTestWorkspace();
        workspace.WriteInstallFile("marker.txt", "current");
        var zipPath = workspace.CreatePackageZip(
            ("marker.txt", "updated"),
            (PrismConstants.UpdateHelperExecutableName, "helper"),
            ("Service/prismsvc.exe", "new-service"));
        var hash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(zipPath))).ToLowerInvariant();
        var launcher = new RecordingLauncher();
        var stopped = false;

        var coordinator = CreateCoordinator(
            workspace,
            new CountingHandler(Package(sha256: hash)),
            new CopyDownloader(zipPath),
            launcher,
            () => stopped = true,
            Eligible);

        var outcome = await coordinator.CheckAsync(Configuration(), CancellationToken.None);

        Assert.Equal(ClientUpdateOutcome.StagedAndRestarting, outcome);
        Assert.True(File.Exists(workspace.Paths.HelperExecutablePath));
        Assert.True(launcher.Started);
        Assert.Equal(workspace.Paths.HelperExecutablePath, launcher.FileName);
        Assert.True(stopped);
        Assert.Equal("current", File.ReadAllText(workspace.InstallFile("marker.txt")));
    }

    private static ClientUpdateCoordinator CreateCoordinator(
        UpdateTestWorkspace workspace,
        HttpMessageHandler handler,
        IUpdatePackageDownloader downloader,
        IProcessLauncher launcher,
        Action requestStop,
        ClientUpdateEligibility eligibility)
    {
        return new ClientUpdateCoordinator(
            new PrismApiClient(new HttpClient(handler)),
            workspace.Paths,
            () => eligibility,
            () => "0.1.0",
            downloader,
            launcher,
            requestStop);
    }

    private static PrismConfiguration Configuration()
    {
        return new PrismConfiguration(
            "https://familyprism.example.test/",
            "client-1",
            "Kitchen PC",
            "pc_secret",
            "/ws");
    }

    private static ClientUpdatePackage Package(string version = "0.2.0", string? sha256 = null)
    {
        return new ClientUpdatePackage(
            "zip",
            1,
            sha256 ?? new string('a', 64),
            "https://example.test/FamilyPrism-0.2.0-win-x64.zip",
            version);
    }

    private sealed class CountingHandler(ClientUpdatePackage? package) : HttpMessageHandler
    {
        public int RequestCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestCount++;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = JsonContent.Create(
                    new ClientUpdateManifest(package),
                    options: new JsonSerializerOptions(JsonSerializerDefaults.Web)),
                RequestMessage = request
            });
        }
    }

    private sealed class CopyDownloader(string sourceZip) : IUpdatePackageDownloader
    {
        public Task DownloadAsync(Uri url, string destinationPath, CancellationToken cancellationToken)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(destinationPath)!);
            File.Copy(sourceZip, destinationPath, overwrite: true);
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingDownloader : IUpdatePackageDownloader
    {
        public int DownloadCount { get; private set; }

        public Task DownloadAsync(Uri url, string destinationPath, CancellationToken cancellationToken)
        {
            DownloadCount++;
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingLauncher : IProcessLauncher
    {
        public bool Started { get; private set; }

        public string? FileName { get; private set; }

        public string Arguments { get; private set; } = string.Empty;

        public void StartDetached(string fileName, string arguments, string workingDirectory)
        {
            Started = true;
            FileName = fileName;
            Arguments = arguments;
        }
    }
}

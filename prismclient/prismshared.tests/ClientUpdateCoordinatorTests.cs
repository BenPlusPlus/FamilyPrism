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

    [Fact]
    public async Task ReconnectWithin15MinutesDoesNotCallTheManifestEndpoint()
    {
        using var workspace = new UpdateTestWorkspace();
        var now = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        var handler = new CountingHandler(Package(version: "0.1.0"));
        var coordinator = CreateCoordinator(
            workspace,
            handler,
            new RecordingDownloader(),
            new RecordingLauncher(),
            () => { },
            Eligible,
            () => now);

        await coordinator.CheckAsync(Configuration(), CancellationToken.None, ClientUpdateCheckTrigger.Start);
        var reconnect = await coordinator.CheckAsync(
            Configuration(),
            CancellationToken.None,
            ClientUpdateCheckTrigger.WebsocketConnect);

        Assert.Equal(ClientUpdateOutcome.Skipped, reconnect);
        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task ReconnectAfter15MinutesCallsTheManifestEndpoint()
    {
        using var workspace = new UpdateTestWorkspace();
        var now = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        var handler = new CountingHandler(Package(version: "0.1.0"));
        var coordinator = CreateCoordinator(
            workspace,
            handler,
            new RecordingDownloader(),
            new RecordingLauncher(),
            () => { },
            Eligible,
            () => now);

        await coordinator.CheckAsync(Configuration(), CancellationToken.None, ClientUpdateCheckTrigger.Start);
        now = now.Add(ClientUpdateSchedule.ReconnectDebounce);
        var reconnect = await coordinator.CheckAsync(
            Configuration(),
            CancellationToken.None,
            ClientUpdateCheckTrigger.WebsocketConnect);

        Assert.Equal(2, handler.RequestCount);
        Assert.Equal(ClientUpdateOutcome.Skipped, reconnect);
    }

    [Fact]
    public async Task FailureBackoffDelaysTheNextCheck()
    {
        using var workspace = new UpdateTestWorkspace();
        var now = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        var handler = new CountingHandler(Package(), HttpStatusCode.InternalServerError);
        var coordinator = CreateCoordinator(
            workspace,
            handler,
            new RecordingDownloader(),
            new RecordingLauncher(),
            () => { },
            Eligible,
            () => now);

        var failed = await coordinator.CheckAsync(
            Configuration(),
            CancellationToken.None,
            ClientUpdateCheckTrigger.Start);
        var duringBackoff = await coordinator.CheckAsync(
            Configuration(),
            CancellationToken.None,
            ClientUpdateCheckTrigger.WebsocketConnect);

        Assert.Equal(ClientUpdateOutcome.Failed, failed);
        Assert.Equal(ClientUpdateOutcome.Skipped, duringBackoff);
        Assert.Equal(1, handler.RequestCount);

        now = now.Add(ClientUpdateSchedule.InitialBackoff);
        await coordinator.CheckAsync(
            Configuration(),
            CancellationToken.None,
            ClientUpdateCheckTrigger.WebsocketConnect);

        Assert.Equal(2, handler.RequestCount);

        var immediatelyAfterSecondFailure = await coordinator.CheckAsync(
            Configuration(),
            CancellationToken.None,
            ClientUpdateCheckTrigger.WebsocketConnect);
        now = now.Add(ClientUpdateSchedule.InitialBackoff);
        var beforeDoubledBackoff = await coordinator.CheckAsync(
            Configuration(),
            CancellationToken.None,
            ClientUpdateCheckTrigger.WebsocketConnect);

        Assert.Equal(ClientUpdateOutcome.Skipped, immediatelyAfterSecondFailure);
        Assert.Equal(ClientUpdateOutcome.Skipped, beforeDoubledBackoff);
        Assert.Equal(2, handler.RequestCount);

        now = now.Add(ClientUpdateSchedule.InitialBackoff);
        await coordinator.CheckAsync(
            Configuration(),
            CancellationToken.None,
            ClientUpdateCheckTrigger.WebsocketConnect);

        Assert.Equal(3, handler.RequestCount);
    }

    [Fact]
    public void TransientFailureBackoffCapsAtSixHours()
    {
        var now = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        var state = new ClientUpdateState();
        var maxSeconds = (int)ClientUpdateSchedule.MaxBackoff.TotalSeconds;

        for (var i = 0; i < 8; i++)
        {
            state = ClientUpdateStateStore.RecordTransientFailure(state, now);
        }

        Assert.Equal(maxSeconds, state.NextRetryDelaySeconds);
        Assert.True(ClientUpdateStateStore.IsInBackoff(state, now.Add(ClientUpdateSchedule.MaxBackoff).AddSeconds(-1)));
        Assert.False(ClientUpdateStateStore.IsInBackoff(state, now.Add(ClientUpdateSchedule.MaxBackoff)));
    }

    [Fact]
    public async Task StartupCheckIsNotSkippedByTheDebounce()
    {
        using var workspace = new UpdateTestWorkspace();
        var now = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        ClientUpdateStateStore.Write(
            workspace.Paths.StatePath,
            new ClientUpdateState(LastSuccessfulCheckAtUtc: now.AddMinutes(-5)));
        var handler = new CountingHandler(Package(version: "0.1.0"));
        var coordinator = CreateCoordinator(
            workspace,
            handler,
            new RecordingDownloader(),
            new RecordingLauncher(),
            () => { },
            Eligible,
            () => now);

        await coordinator.CheckAsync(Configuration(), CancellationToken.None, ClientUpdateCheckTrigger.Start);

        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task PeriodicCheckIsNotSkippedByReconnectDebounce()
    {
        using var workspace = new UpdateTestWorkspace();
        var now = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        ClientUpdateStateStore.Write(
            workspace.Paths.StatePath,
            new ClientUpdateState(LastSuccessfulCheckAtUtc: now.AddMinutes(-5)));
        var handler = new CountingHandler(Package(version: "0.1.0"));
        var coordinator = CreateCoordinator(
            workspace,
            handler,
            new RecordingDownloader(),
            new RecordingLauncher(),
            () => { },
            Eligible,
            () => now);

        await coordinator.CheckAsync(
            Configuration(),
            CancellationToken.None,
            ClientUpdateCheckTrigger.Periodic);

        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task PoisonPilledPinIsNotDownloadedAfterBackoffExpiresUntilThePinChanges()
    {
        using var workspace = new UpdateTestWorkspace();
        var now = new DateTimeOffset(2026, 10, 13, 12, 0, 0, TimeSpan.Zero);
        var package = Package();
        ClientUpdateStateStore.Write(
            workspace.Paths.StatePath,
            new ClientUpdateState(FailedVersion: package.Version, FailedSha256: package.Sha256));
        var downloader = new RecordingDownloader();
        var handler = new CountingHandler(package);
        var coordinator = CreateCoordinator(
            workspace,
            handler,
            downloader,
            new RecordingLauncher(),
            () => { },
            Eligible,
            () => now);

        var start = await coordinator.CheckAsync(
            Configuration(),
            CancellationToken.None,
            ClientUpdateCheckTrigger.Start);
        var reconnectDuringBackoff = await coordinator.CheckAsync(
            Configuration(),
            CancellationToken.None,
            ClientUpdateCheckTrigger.WebsocketConnect);

        Assert.Equal(ClientUpdateOutcome.Skipped, start);
        Assert.Equal(ClientUpdateOutcome.Skipped, reconnectDuringBackoff);
        Assert.Equal(1, handler.RequestCount);
        Assert.Equal(0, downloader.DownloadCount);

        now = now.Add(ClientUpdateSchedule.InitialBackoff);
        var reconnectAfterBackoff = await coordinator.CheckAsync(
            Configuration(),
            CancellationToken.None,
            ClientUpdateCheckTrigger.WebsocketConnect);

        Assert.Equal(ClientUpdateOutcome.Skipped, reconnectAfterBackoff);
        Assert.Equal(2, handler.RequestCount);
        Assert.Equal(0, downloader.DownloadCount);
    }

    private static ClientUpdateCoordinator CreateCoordinator(
        UpdateTestWorkspace workspace,
        HttpMessageHandler handler,
        IUpdatePackageDownloader downloader,
        IProcessLauncher launcher,
        Action requestStop,
        ClientUpdateEligibility eligibility,
        Func<DateTimeOffset>? getUtcNow = null)
    {
        return new ClientUpdateCoordinator(
            new PrismApiClient(new HttpClient(handler)),
            workspace.Paths,
            () => eligibility,
            () => "0.1.0",
            downloader,
            launcher,
            requestStop,
            getUtcNow: getUtcNow);
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

    private sealed class CountingHandler(
        ClientUpdatePackage? package,
        HttpStatusCode statusCode = HttpStatusCode.OK) : HttpMessageHandler
    {
        public int RequestCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestCount++;
            var response = new HttpResponseMessage(statusCode)
            {
                RequestMessage = request
            };
            if (statusCode == HttpStatusCode.OK)
            {
                response.Content = JsonContent.Create(
                    new ClientUpdateManifest(package),
                    options: new JsonSerializerOptions(JsonSerializerDefaults.Web));
            }
            else
            {
                response.Content = new StringContent("manifest unavailable");
            }

            return Task.FromResult(response);
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

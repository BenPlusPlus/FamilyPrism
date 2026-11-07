using System.Text.Json;
using prismshared;

namespace prismshared.tests;

public class DnsOverlayRestorerTests : IDisposable
{
    private static readonly DateTimeOffset ExpiredAt = DateTimeOffset.Parse("2026-03-01T12:15:00Z");
    private static readonly long RetryMs = (long)DnsOverlayRestorer.InitialRetryDelay.TotalMilliseconds;

    private readonly string directory = Path.Combine(Path.GetTempPath(), $"prism-restorer-{Guid.NewGuid():N}");
    private readonly List<FakeAdapter> adapters = [];
    private readonly List<DnsDirectiveResult> reports = [];
    private bool serverReachable = true;

    private string StatePath => Path.Combine(directory, "dns-overlay.json");

    public void Dispose()
    {
        if (Directory.Exists(directory))
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public async Task NoAdaptersAfterWakeKeepsOverlayAndRestoresOnceNetworkIsUp()
    {
        var restorer = Restorer();
        var state = WriteState(Overlay());

        var first = await restorer.RestoreAsync(state, Report, nowTickMs: 1_000, CancellationToken.None);

        Assert.Equal(DnsOverlayRestoreOutcome.AdaptersNotReady, first.Outcome);
        Assert.NotNull(DnsOverlayStateStore.Read(StatePath));
        Assert.Empty(reports);

        var wifi = AddAdapter();
        var second = await restorer.RestoreAsync(
            DnsOverlayStateStore.Read(StatePath)!,
            Report,
            nowTickMs: 1_000 + RetryMs,
            CancellationToken.None);

        Assert.Equal(DnsOverlayRestoreOutcome.Restored, second.Outcome);
        Assert.True(second.StandingAppliedNow);
        Assert.Equal(["1.1.1.1", "1.0.0.1"], wifi.LastServers!);
        Assert.Equal(new DnsDirectiveResult("restore-1", "applied"), Assert.Single(reports));
        Assert.Null(DnsOverlayStateStore.Read(StatePath));
    }

    [Fact]
    public async Task RetryWaitsOutItsBackoffAndTheBackoffGrows()
    {
        var restorer = Restorer();
        var state = WriteState(Overlay());

        await restorer.RestoreAsync(state, Report, nowTickMs: 0, CancellationToken.None);
        var adapter = AddAdapter();

        var early = await restorer.RestoreAsync(state, Report, nowTickMs: RetryMs - 1, CancellationToken.None);
        Assert.Equal(DnsOverlayRestoreOutcome.Deferred, early.Outcome);
        Assert.Equal(0, adapter.Calls);

        adapter.ReturnCode = 91;
        await restorer.RestoreAsync(state, Report, nowTickMs: RetryMs, CancellationToken.None);
        Assert.Equal(1, adapter.Calls);

        // The second failure doubles the wait.
        var stillWaiting = await restorer.RestoreAsync(state, Report, nowTickMs: RetryMs * 3 - 1, CancellationToken.None);
        Assert.Equal(DnsOverlayRestoreOutcome.Deferred, stillWaiting.Outcome);
        Assert.Equal(1, adapter.Calls);
    }

    [Fact]
    public async Task AdapterFailureIsReportedOnceAndRetriedUntilItSucceeds()
    {
        var restorer = Restorer();
        var adapter = AddAdapter(returnCode: 91);
        var state = WriteState(Overlay());

        var tick = 0L;
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var result = await restorer.RestoreAsync(state, Report, tick, CancellationToken.None);
            Assert.Equal(DnsOverlayRestoreOutcome.Failed, result.Outcome);
            tick += (long)DnsOverlayRestorer.MaxRetryDelay.TotalMilliseconds;
        }

        Assert.Equal(3, adapter.Calls);
        var failure = Assert.Single(reports);
        Assert.Equal("failed", failure.Status);
        Assert.Contains("WMI return code 91", failure.Error);
        Assert.NotNull(DnsOverlayStateStore.Read(StatePath));

        adapter.ReturnCode = 0;
        var restored = await restorer.RestoreAsync(state, Report, tick, CancellationToken.None);

        Assert.Equal(DnsOverlayRestoreOutcome.Restored, restored.Outcome);
        Assert.Equal("applied", reports[^1].Status);
        Assert.Null(DnsOverlayStateStore.Read(StatePath));
    }

    [Fact]
    public async Task OfflineReportRetriesOnlyTheReportWithoutRewritingDns()
    {
        var restorer = Restorer();
        var adapter = AddAdapter();
        var state = WriteState(Overlay());
        serverReachable = false;

        var first = await restorer.RestoreAsync(state, Report, nowTickMs: 0, CancellationToken.None);

        Assert.Equal(DnsOverlayRestoreOutcome.RestoredReportPending, first.Outcome);
        Assert.True(first.StandingAppliedNow);
        Assert.Equal(1, adapter.Calls);
        var persisted = DnsOverlayStateStore.Read(StatePath)!;
        Assert.True(persisted.StandingRestored);

        // Each one-second tick while offline: only report attempts, and only after backoff.
        var deferred = await restorer.RestoreAsync(persisted, Report, nowTickMs: 1_000, CancellationToken.None);
        Assert.Equal(DnsOverlayRestoreOutcome.Deferred, deferred.Outcome);

        var stillOffline = await restorer.RestoreAsync(persisted, Report, nowTickMs: RetryMs, CancellationToken.None);
        Assert.Equal(DnsOverlayRestoreOutcome.RestoredReportPending, stillOffline.Outcome);
        Assert.False(stillOffline.StandingAppliedNow);

        serverReachable = true;
        var online = await restorer.RestoreAsync(persisted, Report, nowTickMs: RetryMs * 3, CancellationToken.None);

        Assert.Equal(DnsOverlayRestoreOutcome.Restored, online.Outcome);
        Assert.False(online.StandingAppliedNow);
        Assert.Equal(1, adapter.Calls);
        Assert.Equal(new DnsDirectiveResult("restore-1", "applied"), Assert.Single(reports));
        Assert.Null(DnsOverlayStateStore.Read(StatePath));
    }

    [Fact]
    public async Task ServiceRestartWithReportPendingDoesNotRewriteDns()
    {
        var adapter = AddAdapter();
        WriteState(Overlay() with { StandingRestored = true });

        var result = await Restorer().RestoreAsync(
            DnsOverlayStateStore.Read(StatePath)!,
            Report,
            nowTickMs: 0,
            CancellationToken.None);

        Assert.Equal(DnsOverlayRestoreOutcome.Restored, result.Outcome);
        Assert.Equal(0, adapter.Calls);
        Assert.Single(reports);
    }

    [Fact]
    public async Task ExtendedOverlayExpiringAgainDoesNotInheritOldBackoff()
    {
        var restorer = Restorer();
        var state = WriteState(Overlay());

        await restorer.RestoreAsync(state, Report, nowTickMs: 0, CancellationToken.None);
        var adapter = AddAdapter();

        var extended = WriteState(state with { ExpiresAtUtc = ExpiredAt.AddMinutes(15) });
        var result = await restorer.RestoreAsync(extended, Report, nowTickMs: 1, CancellationToken.None);

        Assert.Equal(DnsOverlayRestoreOutcome.Restored, result.Outcome);
        Assert.Equal(1, adapter.Calls);
    }

    [Fact]
    public async Task OverlayWithoutStandingProfileResetsToDhcp()
    {
        var adapter = AddAdapter();
        var state = WriteState(Overlay() with
        {
            StandingResetToDhcp = true,
            StandingPrimaryIp = null,
            StandingSecondaryIp = null
        });

        await Restorer().RestoreAsync(state, Report, nowTickMs: 0, CancellationToken.None);

        Assert.Equal(1, adapter.Calls);
        Assert.Null(adapter.LastServers);
    }

    [Fact]
    public void StateWrittenBeforeRestoreTrackingReadsAsNotRestored()
    {
        Directory.CreateDirectory(directory);
        File.WriteAllText(
            StatePath,
            """
            {
              "commandId": "overlay-1",
              "restoreCommandId": "restore-1",
              "profileName": "Open",
              "primaryIp": "8.8.8.8",
              "secondaryIp": null,
              "standingResetToDhcp": false,
              "standingProfileName": "School",
              "standingPrimaryIp": "1.1.1.1",
              "standingSecondaryIp": null,
              "expiresAtUtc": "2026-03-01T12:15:00+00:00",
              "remainingMs": 0,
              "lastTickMs": 5
            }
            """);

        var state = DnsOverlayStateStore.Read(StatePath);

        Assert.NotNull(state);
        Assert.False(state.StandingRestored);
    }

    private DnsOverlayRestorer Restorer()
    {
        return new DnsOverlayRestorer(new DnsConfigurationService(() => adapters), statePath: StatePath);
    }

    private Task Report(DnsDirectiveResult result, CancellationToken cancellationToken)
    {
        if (!serverReachable)
        {
            throw new HttpRequestException("No such host is known.");
        }

        reports.Add(result);
        return Task.CompletedTask;
    }

    private FakeAdapter AddAdapter(uint returnCode = 0)
    {
        var adapter = new FakeAdapter { ReturnCode = returnCode };
        adapters.Add(adapter);
        return adapter;
    }

    private DnsOverlayPersistedState WriteState(DnsOverlayPersistedState state)
    {
        DnsOverlayStateStore.Write(state, StatePath);
        return state;
    }

    private static DnsOverlayPersistedState Overlay()
    {
        return new DnsOverlayPersistedState(
            CommandId: "overlay-1",
            RestoreCommandId: "restore-1",
            ProfileName: "Open",
            PrimaryIp: "8.8.8.8",
            SecondaryIp: "8.8.4.4",
            StandingResetToDhcp: false,
            StandingProfileName: "School",
            StandingPrimaryIp: "1.1.1.1",
            StandingSecondaryIp: "1.0.0.1",
            ExpiresAtUtc: ExpiredAt,
            RemainingMs: 0,
            LastTickMs: 0);
    }

    private sealed class FakeAdapter : IDnsAdapterConfig
    {
        public uint ReturnCode { get; set; }

        public int Calls { get; private set; }

        public string[]? LastServers { get; private set; }

        public string Description => "Wi-Fi";

        public uint SetDnsServerSearchOrder(string[]? dnsServers)
        {
            Calls++;
            LastServers = dnsServers;
            return ReturnCode;
        }
    }
}

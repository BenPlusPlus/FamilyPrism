using prismshared;

namespace prismshared.tests;

public class TrayWatchdogTests
{
    private static readonly TrayWatchdogEligibility Armed = new(
        UsesMachineScope: true,
        IsWindowsServiceHost: true,
        BinariesAreInstalledLayout: true);

    [Fact]
    public void PollIntervalIsAboutFiveSeconds()
    {
        Assert.Equal(TimeSpan.FromSeconds(5), TrayWatchdog.PollInterval);
    }

    [Theory]
    [InlineData(false, true, true)]
    [InlineData(true, false, true)]
    [InlineData(true, true, false)]
    public void DebugPortableAndNonServiceHostsAreNotArmed(
        bool usesMachineScope,
        bool isWindowsServiceHost,
        bool binariesAreInstalledLayout)
    {
        Assert.False(new TrayWatchdogEligibility(
            usesMachineScope,
            isWindowsServiceHost,
            binariesAreInstalledLayout).IsArmed);
    }

    [Fact]
    public void InstalledReleaseWindowsServiceIsArmedWithoutRegistration()
    {
        Assert.True(Armed.IsArmed);
    }

    [Fact]
    public void FromEnvironmentDoesNotArmProcessHostOrNonInstallLayout()
    {
        Assert.False(TrayWatchdogEligibility.FromEnvironment("Process", PrismPaths.InstalledServiceDirectory).IsArmed);
        Assert.False(TrayWatchdogEligibility.FromEnvironment("WindowsService", @"C:\not-familyprism-install").IsArmed);
    }

    [Fact]
    public void FromEnvironmentArmsOnlyInstalledReleaseWindowsService()
    {
        var eligibility = TrayWatchdogEligibility.FromEnvironment(
            "WindowsService",
            PrismPaths.InstalledServiceDirectory);
#if DEBUG
        Assert.False(eligibility.IsArmed);
#else
        Assert.True(eligibility.IsArmed);
#endif
    }

    [Fact]
    public async Task RunAsyncReturnsImmediatelyWhenNotArmed()
    {
        var platform = new FakePlatform();
        var watchdog = CreateWatchdog(Armed with { UsesMachineScope = false }, platform);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        await watchdog.RunAsync(cts.Token);

        Assert.Empty(platform.Launches);
        Assert.Empty(platform.ListCalls);
    }

    [Fact]
    public void TickDoesNotLaunchWhenNotArmed()
    {
        var platform = new FakePlatform
        {
            Sessions = [new SessionSnapshot(1, IsActive: true)]
        };

        CreateWatchdog(Armed with { IsWindowsServiceHost = false }, platform).Tick();

        Assert.Empty(platform.Launches);
    }

    [Fact]
    public void SkipsSessionZeroAndInactiveSessions()
    {
        var platform = new FakePlatform
        {
            Sessions =
            [
                new SessionSnapshot(0, IsActive: true),
                new SessionSnapshot(2, IsActive: false),
                new SessionSnapshot(4, IsActive: false)
            ]
        };

        CreateWatchdog(Armed, platform).Tick();

        Assert.Empty(platform.Launches);
    }

    [Fact]
    public void StartsMissingTrayViaCreateProcessAsUserPath()
    {
        var platform = new FakePlatform
        {
            Sessions = [new SessionSnapshot(1, IsActive: true)]
        };

        CreateWatchdog(Armed, platform).Tick();

        var launch = Assert.Single(platform.Launches);
        Assert.Equal(1, launch.SessionId);
        Assert.Equal(PrismPaths.InstalledAgentExecutablePath, launch.ExecutablePath);
        Assert.Equal(
            Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
                "FamilyPrism",
                "prismagent.exe"),
            launch.ExecutablePath);
    }

    [Fact]
    public void DoesNotStartWhenPrismagentIsAlreadyInTheSession()
    {
        var platform = new FakePlatform
        {
            Sessions = [new SessionSnapshot(1, IsActive: true)],
            SessionsWithTray = { 1 }
        };

        CreateWatchdog(Armed, platform).Tick();

        Assert.Empty(platform.Launches);
    }

    [Fact]
    public void StartsOnlyTheSessionThatIsMissingATray()
    {
        var platform = new FakePlatform
        {
            Sessions =
            [
                new SessionSnapshot(1, IsActive: true),
                new SessionSnapshot(2, IsActive: true)
            ],
            SessionsWithTray = { 1 }
        };

        CreateWatchdog(Armed, platform).Tick();

        var launch = Assert.Single(platform.Launches);
        Assert.Equal(2, launch.SessionId);
    }

    [Fact]
    public void ProcessDeathDoesNotGiveUp()
    {
        var platform = new FakePlatform
        {
            Sessions = [new SessionSnapshot(1, IsActive: true)],
            SessionsWithTray = { 1 }
        };
        var watchdog = CreateWatchdog(Armed, platform);

        watchdog.Tick();
        Assert.Empty(platform.Launches);

        platform.SessionsWithTray.Clear();
        watchdog.Tick();
        watchdog.Tick();

        Assert.Equal(2, platform.Launches.Count);
        Assert.All(platform.Launches, launch => Assert.Equal(1, launch.SessionId));
    }

    [Fact]
    public void LaunchApiFailureLogsAndRetriesOnTheNextPass()
    {
        var errors = new List<string>();
        var platform = new FakePlatform
        {
            Sessions = [new SessionSnapshot(1, IsActive: true)],
            LaunchSucceeds = false,
            LaunchError = "token not ready"
        };
        var watchdog = CreateWatchdog(
            Armed,
            platform,
            logError: (message, _) => errors.Add(message));

        watchdog.Tick();
        watchdog.Tick();

        Assert.Equal(2, platform.Launches.Count);
        Assert.Contains(errors, message => message.Contains("session 1", StringComparison.Ordinal)
            && message.Contains("token not ready", StringComparison.Ordinal));
    }

    private static TrayWatchdog CreateWatchdog(
        TrayWatchdogEligibility eligibility,
        ITrayWatchdogPlatform platform,
        Action<string, Exception?>? logError = null)
    {
        return new TrayWatchdog(
            () => eligibility,
            platform,
            logError: logError);
    }

    private sealed class FakePlatform : ITrayWatchdogPlatform
    {
        public List<SessionSnapshot> Sessions { get; set; } = [];

        public HashSet<int> SessionsWithTray { get; } = [];

        public List<int> ListCalls { get; } = [];

        public List<(int SessionId, string ExecutablePath)> Launches { get; } = [];

        public bool LaunchSucceeds { get; set; } = true;

        public string? LaunchError { get; set; }

        public IReadOnlyList<SessionSnapshot> ListSessions()
        {
            ListCalls.Add(1);
            return Sessions;
        }

        public bool HasProcess(int sessionId, string processName)
        {
            return processName == PrismConstants.AgentProcessName
                && SessionsWithTray.Contains(sessionId);
        }

        public bool TryLaunch(int sessionId, string executablePath, out string? error)
        {
            Launches.Add((sessionId, executablePath));
            error = LaunchSucceeds ? null : LaunchError;
            return LaunchSucceeds;
        }
    }
}

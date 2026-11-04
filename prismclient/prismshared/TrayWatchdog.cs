namespace prismshared;

public sealed record TrayWatchdogEligibility(
    bool UsesMachineScope,
    bool IsWindowsServiceHost,
    bool BinariesAreInstalledLayout)
{
    public bool IsArmed =>
        UsesMachineScope
        && IsWindowsServiceHost
        && BinariesAreInstalledLayout;

    public static TrayWatchdogEligibility FromEnvironment(string hostMode, string? baseDirectory = null)
    {
        return new TrayWatchdogEligibility(
            PrismBuildMode.UsesMachineScope,
            string.Equals(hostMode, "WindowsService", StringComparison.Ordinal),
            ClientUpdateEligibility.IsInstalledServiceLayout(baseDirectory));
    }
}

public sealed record SessionSnapshot(int SessionId, bool IsActive);

public interface ITrayWatchdogPlatform
{
    IReadOnlyList<SessionSnapshot> ListSessions();

    bool HasProcess(int sessionId, string processName);

    bool TryLaunch(int sessionId, string executablePath, out string? error);
}

public sealed class TrayWatchdog
{
    public static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);

    public const string DefaultDesktop = @"WinSta0\Default";

    private readonly Func<TrayWatchdogEligibility> getEligibility;
    private readonly ITrayWatchdogPlatform platform;
    private readonly Action<string>? logInformation;
    private readonly Action<string, Exception?>? logError;

    public TrayWatchdog(
        Func<TrayWatchdogEligibility> getEligibility,
        ITrayWatchdogPlatform platform,
        Action<string>? logInformation = null,
        Action<string, Exception?>? logError = null)
    {
        this.getEligibility = getEligibility;
        this.platform = platform;
        this.logInformation = logInformation;
        this.logError = logError;
    }

    public static TrayWatchdog CreateDefault(
        string hostMode,
        Action<string>? logInformation = null,
        Action<string, Exception?>? logError = null)
    {
        return new TrayWatchdog(
            () => TrayWatchdogEligibility.FromEnvironment(hostMode),
            new WindowsTrayWatchdogPlatform(),
            logInformation,
            logError);
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        if (!getEligibility().IsArmed)
        {
            return;
        }

        using var timer = new PeriodicTimer(PollInterval);
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                Tick();
            }
            catch (Exception ex)
            {
                logError?.Invoke("The Watchdog pass failed.", ex);
            }

            try
            {
                await timer.WaitForNextTickAsync(cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
        }
    }

    public void Tick()
    {
        if (!getEligibility().IsArmed)
        {
            return;
        }

        IReadOnlyList<SessionSnapshot> listed;
        try
        {
            listed = platform.ListSessions();
        }
        catch (Exception ex)
        {
            logError?.Invoke("The Watchdog could not list interactive sessions.", ex);
            return;
        }

        foreach (var session in listed)
        {
            if (session.SessionId == 0 || !session.IsActive)
            {
                continue;
            }

            bool present;
            try
            {
                present = platform.HasProcess(session.SessionId, PrismConstants.AgentProcessName);
            }
            catch (Exception ex)
            {
                logError?.Invoke($"The Watchdog could not inspect session {session.SessionId}.", ex);
                continue;
            }

            if (present)
            {
                continue;
            }

            if (platform.TryLaunch(session.SessionId, PrismPaths.InstalledAgentExecutablePath, out var error))
            {
                logInformation?.Invoke($"The Watchdog started the Tray in session {session.SessionId}.");
                continue;
            }

            logError?.Invoke(
                $"The Watchdog could not start the Tray in session {session.SessionId}. {error}",
                null);
        }
    }
}

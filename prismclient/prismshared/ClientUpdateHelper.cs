using System.Diagnostics;

namespace prismshared;

public interface IWindowsServiceControl
{
    void Start(string serviceName);

    bool WaitUntilStopped(string serviceName, TimeSpan timeout);

    bool WaitUntilRunning(string serviceName, TimeSpan timeout);

    bool IsProcessAlive(string processName);
}

public interface IUserSession
{
    bool IsUserLoggedOn();

    void KillProcess(string processName);

    void RunLogonTask(string taskName);
}

public static class ClientUpdateHelper
{
    public static readonly TimeSpan HealthTimeout = TimeSpan.FromSeconds(30);

    public static readonly TimeSpan ServiceStopTimeout = TimeSpan.FromSeconds(60);

    private const int FileOperationAttempts = 10;

    private static readonly TimeSpan DefaultFileRetryDelay = TimeSpan.FromMilliseconds(500);

    public static int RunFromCommandLine(string[] args)
    {
        var planPath = ParsePlanPath(args);
        if (string.IsNullOrWhiteSpace(planPath))
        {
            return 1;
        }

        var plan = AtomicJsonFileStore.Read<ClientUpdatePlan>(planPath)
            ?? throw new InvalidOperationException($"The update plan '{planPath}' could not be read.");

        var logPath = Path.Combine(Path.GetDirectoryName(planPath) ?? PrismPaths.UpdatesDirectory, "prismupdate.log");
        var result = Apply(
            plan,
            new ScWindowsServiceControl(),
            new WindowsUserSession(),
            log: message => AppendLog(logPath, message));
        return result == ClientUpdateHelperResult.Failed ? 1 : 0;
    }

    public static string? ParsePlanPath(string[] args)
    {
        for (var index = 0; index < args.Length - 1; index++)
        {
            if (args[index].Equals("--plan", StringComparison.OrdinalIgnoreCase))
            {
                return args[index + 1];
            }
        }

        return null;
    }

    public static ClientUpdateHelperResult Apply(
        ClientUpdatePlan plan,
        IWindowsServiceControl services,
        IUserSession sessions,
        TimeSpan? parentWaitTimeout = null,
        TimeSpan? healthTimeout = null,
        TimeSpan? serviceStopTimeout = null,
        TimeSpan? fileRetryDelay = null,
        Action<string>? log = null)
    {
        var health = healthTimeout ?? HealthTimeout;
        var retryDelay = fileRetryDelay ?? DefaultFileRetryDelay;
        log ??= _ => { };
        log($"Applying client update {plan.Version}.");

        WaitForParent(plan.ParentProcessId, parentWaitTimeout ?? TimeSpan.FromMinutes(2));
        if (!services.WaitUntilStopped(plan.ServiceName, serviceStopTimeout ?? ServiceStopTimeout))
        {
            // Never copy over binaries that may still be loaded. Leave the install untouched and
            // make sure the service is running so the PC stays online.
            log("The service did not stop in time; the update was not applied.");

            // If it is still shutting down, `sc start` would fail and leave it stopped. Give it
            // longer to finish stopping, then start it (a no-op if it never stopped).
            services.WaitUntilStopped(plan.ServiceName, (serviceStopTimeout ?? ServiceStopTimeout) * 5);
            services.Start(plan.ServiceName);
            PersistTransientFailure(plan, log);
            return ClientUpdateHelperResult.Failed;
        }

        sessions.KillProcess(plan.AgentProcessName);

        try
        {
            ReplaceDirectory(plan.InstallDirectory, plan.PreviousDirectory);
        }
        catch (Exception ex)
        {
            log($"The current install could not be backed up; the update was not applied. {ex}");
            services.Start(plan.ServiceName);
            RestartTrayIfLoggedOn(sessions, plan);
            PersistTransientFailure(plan, log);
            return ClientUpdateHelperResult.Failed;
        }

        try
        {
            OverlayDirectory(plan.StagingDirectory, plan.InstallDirectory, retryDelay);
        }
        catch (Exception ex)
        {
            log($"The new files could not be copied into place; restoring the previous version. {ex}");
            RestoreBestEffort(plan, retryDelay, log);
            services.Start(plan.ServiceName);
            RestartTrayIfLoggedOn(sessions, plan);
            PersistTransientFailure(plan, log);
            return ClientUpdateHelperResult.Failed;
        }

        services.Start(plan.ServiceName);
        if (!IsHealthy(services, plan.ServiceName, health))
        {
            log("The updated service did not reach Running; rolling back.");
            services.WaitUntilStopped(plan.ServiceName, serviceStopTimeout ?? ServiceStopTimeout);
            RestoreBestEffort(plan, retryDelay, log);
            services.Start(plan.ServiceName);
            services.WaitUntilRunning(plan.ServiceName, health);
            PersistFailedPin(plan);
            RestartTrayIfLoggedOn(sessions, plan);
            return ClientUpdateHelperResult.RolledBack;
        }

        RestartTrayIfLoggedOn(sessions, plan);
        log($"Client update {plan.Version} applied.");
        return ClientUpdateHelperResult.Applied;
    }

    private static bool IsHealthy(IWindowsServiceControl services, string serviceName, TimeSpan healthTimeout)
    {
        return services.WaitUntilRunning(serviceName, healthTimeout)
            && services.IsProcessAlive(serviceName);
    }

    private static void RestartTrayIfLoggedOn(IUserSession sessions, ClientUpdatePlan plan)
    {
        if (!sessions.IsUserLoggedOn())
        {
            return;
        }

        sessions.KillProcess(plan.AgentProcessName);
        sessions.RunLogonTask(plan.LogonTaskName);
    }

    private static void PersistFailedPin(ClientUpdatePlan plan)
    {
        var state = ClientUpdateStateStore.Read(plan.StatePath);
        ClientUpdateStateStore.Write(plan.StatePath, ClientUpdateStateStore.RecordFailedPin(state, plan));
    }

    private static void PersistTransientFailure(ClientUpdatePlan plan, Action<string> log)
    {
        try
        {
            var state = ClientUpdateStateStore.Read(plan.StatePath);
            var package = new ClientUpdatePackage(
                ClientUpdatePlanner.SupportedKind,
                ClientUpdatePlanner.UnderstoodLayoutGeneration,
                plan.Sha256,
                string.Empty,
                plan.Version);
            ClientUpdateStateStore.Write(
                plan.StatePath,
                ClientUpdateStateStore.RecordTransientFailure(state, DateTimeOffset.UtcNow, package));
        }
        catch (Exception ex)
        {
            log($"The update failure could not be recorded. {ex}");
        }
    }

    private static void RestoreBestEffort(ClientUpdatePlan plan, TimeSpan retryDelay, Action<string> log)
    {
        foreach (var failure in RestoreFromPrevious(plan.PreviousDirectory, plan.StagingDirectory, plan.InstallDirectory, retryDelay))
        {
            log($"Restore could not write '{failure}'.");
        }
    }

    private static void WaitForParent(int parentProcessId, TimeSpan timeout)
    {
        if (parentProcessId <= 0)
        {
            return;
        }

        try
        {
            using var parent = Process.GetProcessById(parentProcessId);
            parent.WaitForExit((int)Math.Clamp(timeout.TotalMilliseconds, 1, int.MaxValue));
        }
        catch (ArgumentException)
        {
        }
        catch (InvalidOperationException)
        {
        }
    }

    /// <summary>Replaces <paramref name="destination"/> with a copy of <paramref name="source"/>. Used only for the backup copy, which nothing else holds open.</summary>
    internal static void ReplaceDirectory(string source, string destination)
    {
        if (!Directory.Exists(source))
        {
            throw new DirectoryNotFoundException($"The update source '{source}' was not found.");
        }

        if (Directory.Exists(destination))
        {
            Directory.Delete(destination, recursive: true);
        }

        CopyDirectory(source, destination, TimeSpan.Zero, attempts: 1);
    }

    /// <summary>
    /// Copies every file from <paramref name="source"/> over <paramref name="destination"/>.
    /// Files in the destination that the package does not contain (for example the Inno Setup
    /// uninstaller) are left alone, and locked files are retried before giving up.
    /// </summary>
    internal static void OverlayDirectory(string source, string destination, TimeSpan retryDelay)
    {
        if (!Directory.Exists(source))
        {
            throw new DirectoryNotFoundException($"The update source '{source}' was not found.");
        }

        CopyDirectory(source, destination, retryDelay, FileOperationAttempts);
    }

    /// <summary>
    /// Puts the install back the way it was: copies the backup over it and deletes files that only
    /// the new package added. Keeps going past individual failures and returns the paths it could not fix.
    /// </summary>
    internal static IReadOnlyList<string> RestoreFromPrevious(
        string previous,
        string staging,
        string install,
        TimeSpan retryDelay)
    {
        var failures = new List<string>();
        if (!Directory.Exists(previous))
        {
            failures.Add(previous);
            return failures;
        }

        if (Directory.Exists(staging))
        {
            foreach (var stagedFile in Directory.GetFiles(staging, "*", SearchOption.AllDirectories))
            {
                var relativePath = Path.GetRelativePath(staging, stagedFile);
                if (File.Exists(Path.Combine(previous, relativePath)))
                {
                    continue;
                }

                var installedFile = Path.Combine(install, relativePath);
                if (!TryWithRetries(() => { if (File.Exists(installedFile)) File.Delete(installedFile); }, retryDelay, FileOperationAttempts))
                {
                    failures.Add(installedFile);
                }
            }
        }

        foreach (var file in Directory.GetFiles(previous, "*", SearchOption.AllDirectories))
        {
            var destinationFile = Path.Combine(install, Path.GetRelativePath(previous, file));
            if (!TryWithRetries(() => CopyFile(file, destinationFile), retryDelay, FileOperationAttempts))
            {
                failures.Add(destinationFile);
            }
        }

        return failures;
    }

    private static void CopyDirectory(string source, string destination, TimeSpan retryDelay, int attempts)
    {
        Directory.CreateDirectory(destination);

        foreach (var directory in Directory.GetDirectories(source, "*", SearchOption.AllDirectories))
        {
            Directory.CreateDirectory(Path.Combine(destination, Path.GetRelativePath(source, directory)));
        }

        foreach (var file in Directory.GetFiles(source, "*", SearchOption.AllDirectories))
        {
            var destinationFile = Path.Combine(destination, Path.GetRelativePath(source, file));
            RunWithRetries(() => CopyFile(file, destinationFile), retryDelay, attempts);
        }
    }

    private static void CopyFile(string source, string destination)
    {
        var destinationDirectory = Path.GetDirectoryName(destination);
        if (!string.IsNullOrWhiteSpace(destinationDirectory))
        {
            Directory.CreateDirectory(destinationDirectory);
        }

        File.Copy(source, destination, overwrite: true);
    }

    private static bool TryWithRetries(Action action, TimeSpan retryDelay, int attempts)
    {
        try
        {
            RunWithRetries(action, retryDelay, attempts);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    private static void RunWithRetries(Action action, TimeSpan retryDelay, int attempts)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                action();
                return;
            }
            catch (Exception ex) when (attempt < attempts && ex is IOException or UnauthorizedAccessException)
            {
                Thread.Sleep(retryDelay);
            }
        }
    }

    private static void AppendLog(string logPath, string message)
    {
        try
        {
            File.AppendAllText(logPath, $"{DateTimeOffset.UtcNow:o} {message}{Environment.NewLine}");
        }
        catch
        {
        }
    }
}

public sealed class ScWindowsServiceControl : IWindowsServiceControl
{
    public void Start(string serviceName)
    {
        RunScCommand($"start {serviceName}", throwOnError: false);
    }

    public bool WaitUntilStopped(string serviceName, TimeSpan timeout)
    {
        return WaitForState(serviceName, "STOPPED", timeout);
    }

    public bool WaitUntilRunning(string serviceName, TimeSpan timeout)
    {
        return WaitForState(serviceName, "RUNNING", timeout);
    }

    public bool IsProcessAlive(string processName)
    {
        return Process.GetProcessesByName(processName).Length > 0;
    }

    private static bool WaitForState(string serviceName, string expectedState, TimeSpan timeout)
    {
        var deadline = DateTimeOffset.UtcNow + timeout;
        while (DateTimeOffset.UtcNow < deadline)
        {
            var output = RunScCommand($"query {serviceName}", throwOnError: false).StandardOutput;
            if (output.Contains(expectedState, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            Thread.Sleep(250);
        }

        return false;
    }

    private static ScCommandResult RunScCommand(string arguments, bool throwOnError)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "sc.exe",
                Arguments = arguments,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            }
        };

        process.Start();
        var standardOutput = process.StandardOutput.ReadToEnd();
        var standardError = process.StandardError.ReadToEnd();
        process.WaitForExit();

        if (throwOnError && process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"The service control command 'sc.exe {arguments}' failed with exit code {process.ExitCode}: {standardOutput}{Environment.NewLine}{standardError}".Trim());
        }

        return new ScCommandResult(process.ExitCode, standardOutput, standardError);
    }

    private sealed record ScCommandResult(int ExitCode, string StandardOutput, string StandardError);
}

public sealed class WindowsUserSession : IUserSession
{
    public bool IsUserLoggedOn()
    {
        return Process.GetProcessesByName("explorer").Length > 0;
    }

    public void KillProcess(string processName)
    {
        foreach (var process in Process.GetProcessesByName(processName))
        {
            try
            {
                process.Kill(entireProcessTree: true);
                process.WaitForExit(5000);
            }
            catch
            {
            }
            finally
            {
                process.Dispose();
            }
        }
    }

    public void RunLogonTask(string taskName)
    {
        using var process = Process.Start(new ProcessStartInfo
        {
            FileName = "schtasks.exe",
            Arguments = $"/Run /TN \"{taskName}\"",
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        });

        process?.WaitForExit(15000);
    }
}

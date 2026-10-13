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

    public static int RunFromCommandLine(string[] args)
    {
        var planPath = ParsePlanPath(args);
        if (string.IsNullOrWhiteSpace(planPath))
        {
            return 1;
        }

        var plan = AtomicJsonFileStore.Read<ClientUpdatePlan>(planPath)
            ?? throw new InvalidOperationException($"The update plan '{planPath}' could not be read.");

        var result = Apply(plan, new ScWindowsServiceControl(), new WindowsUserSession());
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
        TimeSpan? healthTimeout = null)
    {
        var health = healthTimeout ?? HealthTimeout;

        WaitForParent(plan.ParentProcessId, parentWaitTimeout ?? TimeSpan.FromMinutes(2));
        services.WaitUntilStopped(plan.ServiceName, TimeSpan.FromSeconds(30));
        sessions.KillProcess(plan.AgentProcessName);

        ReplaceDirectory(plan.InstallDirectory, plan.PreviousDirectory);

        try
        {
            ReplaceDirectory(plan.StagingDirectory, plan.InstallDirectory);
        }
        catch
        {
            if (Directory.Exists(plan.PreviousDirectory))
            {
                ReplaceDirectory(plan.PreviousDirectory, plan.InstallDirectory);
            }

            throw;
        }

        services.Start(plan.ServiceName);
        if (!IsHealthy(services, plan.ServiceName, health))
        {
            ReplaceDirectory(plan.PreviousDirectory, plan.InstallDirectory);
            services.Start(plan.ServiceName);
            services.WaitUntilRunning(plan.ServiceName, health);
            PersistFailedPin(plan);
            RestartTrayIfLoggedOn(sessions, plan);
            return ClientUpdateHelperResult.RolledBack;
        }

        RestartTrayIfLoggedOn(sessions, plan);
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

        CopyDirectory(source, destination);
    }

    private static void CopyDirectory(string source, string destination)
    {
        Directory.CreateDirectory(destination);

        foreach (var directory in Directory.GetDirectories(source, "*", SearchOption.AllDirectories))
        {
            Directory.CreateDirectory(Path.Combine(destination, Path.GetRelativePath(source, directory)));
        }

        foreach (var file in Directory.GetFiles(source, "*", SearchOption.AllDirectories))
        {
            var destinationFile = Path.Combine(destination, Path.GetRelativePath(source, file));
            var destinationDirectory = Path.GetDirectoryName(destinationFile);
            if (!string.IsNullOrWhiteSpace(destinationDirectory))
            {
                Directory.CreateDirectory(destinationDirectory);
            }

            File.Copy(file, destinationFile, overwrite: true);
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

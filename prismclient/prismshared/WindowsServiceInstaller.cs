using System.Diagnostics;

namespace prismshared;

public static class WindowsServiceInstaller
{
    public static void InstallOrUpdate()
    {
        if (!Directory.Exists(PrismPaths.BundledServiceDirectory))
        {
            throw new DirectoryNotFoundException(
                $"The bundled service files were not found at '{PrismPaths.BundledServiceDirectory}'.");
        }

        if (ServiceExists())
        {
            StopServiceIfRunning();
        }

        WaitUntilServiceProcessExits();

        if (!IsSamePath(PrismPaths.BundledServiceDirectory, PrismPaths.InstalledServiceDirectory))
        {
            CopyServiceFiles(
                PrismPaths.BundledServiceDirectory,
                PrismPaths.InstalledServiceDirectory);
        }

        var quotedServicePath = $"\"{PrismPaths.InstalledServiceExecutablePath}\"";

        if (ServiceExists())
        {
            RunScCommand(
                $"config {PrismConstants.ServiceName} binPath= {quotedServicePath} start= auto displayname= \"{PrismConstants.ServiceDisplayName}\"");
        }
        else
        {
            RunScCommand(
                $"create {PrismConstants.ServiceName} binPath= {quotedServicePath} start= auto displayname= \"{PrismConstants.ServiceDisplayName}\"");
        }

        RunScCommand(
            $"description {PrismConstants.ServiceName} \"Family Prism background agent service\"");

        StartService();
    }

    public static bool ServiceExists()
    {
        var result = RunScCommand($"query {PrismConstants.ServiceName}", throwOnError: false);
        return result.ExitCode == 0;
    }

    internal static bool IsSamePath(string left, string right)
    {
        var leftFull = Path.GetFullPath(left)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var rightFull = Path.GetFullPath(right)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

        return string.Equals(leftFull, rightFull, StringComparison.OrdinalIgnoreCase);
    }

    internal static void CopyServiceFiles(string sourceDirectory, string destinationDirectory)
    {
        if (IsSamePath(sourceDirectory, destinationDirectory))
        {
            return;
        }

        Directory.CreateDirectory(destinationDirectory);

        foreach (var sourcePath in Directory.GetFiles(sourceDirectory, "*", SearchOption.AllDirectories))
        {
            var relativePath = Path.GetRelativePath(sourceDirectory, sourcePath);
            var destinationPath = Path.Combine(destinationDirectory, relativePath);
            if (IsSamePath(sourcePath, destinationPath))
            {
                continue;
            }

            var destinationFileDirectory = Path.GetDirectoryName(destinationPath)
                ?? throw new InvalidOperationException("The destination directory could not be determined.");

            Directory.CreateDirectory(destinationFileDirectory);
            File.Copy(sourcePath, destinationPath, overwrite: true);
        }
    }

    private static void StartService()
    {
        var queryOutput = RunScCommand($"query {PrismConstants.ServiceName}", throwOnError: false).StandardOutput;
        if (queryOutput.Contains("RUNNING", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        RunScCommand($"start {PrismConstants.ServiceName}", throwOnError: false);
        WaitForState("RUNNING");
    }

    private static void StopServiceIfRunning()
    {
        var queryOutput = RunScCommand($"query {PrismConstants.ServiceName}", throwOnError: false).StandardOutput;
        if (queryOutput.Contains("STOPPED", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        RunScCommand($"stop {PrismConstants.ServiceName}", throwOnError: false);
        WaitForState("STOPPED");
    }

    private static void WaitUntilServiceProcessExits()
    {
        var deadline = DateTimeOffset.UtcNow.AddSeconds(30);

        while (DateTimeOffset.UtcNow < deadline)
        {
            if (Process.GetProcessesByName(PrismConstants.ServiceName).Length == 0)
            {
                return;
            }

            Thread.Sleep(250);
        }

        throw new InvalidOperationException(
            $"The {PrismConstants.ServiceName} process did not exit in time.");
    }

    private static void WaitForState(string expectedState)
    {
        var deadline = DateTimeOffset.UtcNow.AddSeconds(30);

        while (DateTimeOffset.UtcNow < deadline)
        {
            var result = RunScCommand($"query {PrismConstants.ServiceName}", throwOnError: false);
            if (result.StandardOutput.Contains(expectedState, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            Thread.Sleep(1000);
        }

        throw new InvalidOperationException(
            $"The {PrismConstants.ServiceName} service did not reach the '{expectedState}' state in time.");
    }

    private static ScCommandResult RunScCommand(string arguments, bool throwOnError = true)
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

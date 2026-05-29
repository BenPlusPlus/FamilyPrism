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

        CopyServiceFiles();

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

    private static void CopyServiceFiles()
    {
        Directory.CreateDirectory(PrismPaths.InstalledServiceDirectory);

        foreach (var sourcePath in Directory.GetFiles(PrismPaths.BundledServiceDirectory, "*", SearchOption.AllDirectories))
        {
            var relativePath = Path.GetRelativePath(PrismPaths.BundledServiceDirectory, sourcePath);
            var destinationPath = Path.Combine(PrismPaths.InstalledServiceDirectory, relativePath);
            var destinationDirectory = Path.GetDirectoryName(destinationPath)
                ?? throw new InvalidOperationException("The destination directory could not be determined.");

            Directory.CreateDirectory(destinationDirectory);
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
        if (!queryOutput.Contains("RUNNING", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        RunScCommand($"stop {PrismConstants.ServiceName}", throwOnError: false);
        WaitForState("STOPPED");
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

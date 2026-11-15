using System.Diagnostics;
using prismbridge;

namespace prismbridge.service;

/// <summary>Registers this executable as the prismbridge Windows service, restarting it if it ever stops.</summary>
internal static class BridgeServiceInstaller
{
    public static int Install(string executablePath)
    {
        if (!BridgeConfigurationStore.Exists())
        {
            Console.Error.WriteLine("Run 'prismbridge setup' first.");
            return 1;
        }

        var binPath = $"\"{executablePath}\"";
        var verb = IsInstalled() ? "config" : "create";
        Sc($"{verb} {BridgeConstants.ServiceName} binPath= {binPath} start= delayed-auto displayname= \"{BridgeConstants.ServiceDisplayName}\"");
        Sc($"description {BridgeConstants.ServiceName} \"{BridgeConstants.ServiceDescription}\"");
        Sc($"failure {BridgeConstants.ServiceName} reset= 86400 actions= restart/60000/restart/60000/restart/300000");
        Sc($"start {BridgeConstants.ServiceName}", throwOnError: false);
        Console.WriteLine($"Installed {BridgeConstants.ServiceDisplayName} from {executablePath} and started it.");
        Console.WriteLine("Keep this folder in place; the service runs from it.");
        return 0;
    }

    public static int Uninstall()
    {
        if (!IsInstalled())
        {
            Console.WriteLine("The service isn't installed.");
            return 0;
        }

        Sc($"stop {BridgeConstants.ServiceName}", throwOnError: false);
        Sc($"delete {BridgeConstants.ServiceName}");
        Console.WriteLine("Removed the service. The router keeps whatever it blocks now; the saved setup stays on this PC.");
        return 0;
    }

    public static bool IsInstalled() => Sc($"query {BridgeConstants.ServiceName}", throwOnError: false) == 0;

    private static int Sc(string arguments, bool throwOnError = true)
    {
        using var process = Process.Start(new ProcessStartInfo("sc.exe", arguments)
        {
            CreateNoWindow = true,
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            UseShellExecute = false
        })!;
        var output = process.StandardOutput.ReadToEnd() + process.StandardError.ReadToEnd();
        process.WaitForExit();
        if (throwOnError && process.ExitCode != 0)
        {
            throw new InvalidOperationException($"'sc.exe {arguments}' failed ({process.ExitCode}): {output.Trim()}");
        }

        return process.ExitCode;
    }
}

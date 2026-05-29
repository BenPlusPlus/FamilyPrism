using System.ComponentModel;
using System.Diagnostics;

namespace prismagent;

internal static class SetupCompletionLauncher
{
    public static async Task<int> RunAsync(string pendingSetupPath)
    {
        using var process = Process.Start(new ProcessStartInfo
        {
            FileName = Application.ExecutablePath,
            Arguments = $"--complete-setup \"{pendingSetupPath}\"",
            UseShellExecute = true,
#if !DEBUG
            Verb = "runas"
#endif
        });

        if (process is null)
        {
            throw new InvalidOperationException("The Family Prism setup helper could not be started.");
        }

        await process.WaitForExitAsync();
        return process.ExitCode;
    }

    public static bool WasElevationCanceled(Win32Exception exception) => exception.NativeErrorCode == 1223;
}

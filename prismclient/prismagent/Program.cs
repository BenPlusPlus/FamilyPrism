using prismshared;

namespace prismagent;

internal static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        if (SetupCompletionRunner.CanHandle(args))
        {
            Environment.ExitCode = SetupCompletionRunner.Run(args);
            return;
        }

        if (!TraySessionMutex.TryAcquire(out var sessionMutex))
        {
            return;
        }

        using (sessionMutex)
        {
            ApplicationConfiguration.Initialize();
            Application.Run(new TrayApplicationContext());
        }
    }
}
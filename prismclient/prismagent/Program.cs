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

        ApplicationConfiguration.Initialize();
        Application.Run(new TrayApplicationContext());
    }
}
using prismshared;

namespace prismagent;

internal static class SetupCompletionRunner
{
    public static bool CanHandle(string[] args)
    {
        return args.Length == 2
            && args[0].Equals("--complete-setup", StringComparison.OrdinalIgnoreCase);
    }

    public static int Run(string[] args)
    {
        try
        {
            var pendingSetupPath = args[1];
            var payload = PendingSetupStore.Read(pendingSetupPath);

            MachineConfigurationStore.Save(payload);
            PrismStatusStore.Save(new PrismStatusSnapshot
            {
                IsSetupComplete = true,
                HostMode =
#if DEBUG
                    "Process",
#else
                    "WindowsService",
#endif
                ConnectionState = PrismConnectionState.Starting,
                StatusMessage =
#if DEBUG
                    "Setup complete. Starting the local debug agent process...",
#else
                    "Setup complete. Installing and starting the Windows service...",
#endif
                ServerBaseUrl = payload.ServerBaseUrl,
                ClientId = payload.ClientId,
                ClientName = payload.ClientName
            });

#if !DEBUG
            WindowsServiceInstaller.InstallOrUpdate();
#endif

            PendingSetupStore.Delete(pendingSetupPath);
            return 0;
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                ex.Message,
                "Family Prism setup",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);

            return 1;
        }
    }
}

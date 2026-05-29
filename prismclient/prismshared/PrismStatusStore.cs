namespace prismshared;

public static class PrismStatusStore
{
    public static bool IsSetupComplete()
    {
        var snapshot = TryRead();
        return snapshot?.IsSetupComplete == true;
    }

    public static PrismStatusSnapshot ReadOrDefault()
    {
        return TryRead()
            ?? new PrismStatusSnapshot
            {
                IsSetupComplete = false,
                HostMode = "Tray",
                ConnectionState = PrismConnectionState.NotConfigured,
                StatusMessage = "Waiting for setup.",
                UpdatedAtUtc = DateTimeOffset.UtcNow
            };
    }

    public static void Save(PrismStatusSnapshot snapshot)
    {
        MachineConfigurationStore.EnsureStateDirectory();
        AtomicJsonFileStore.Write(PrismPaths.StatusPath, snapshot with
        {
            UpdatedAtUtc = DateTimeOffset.UtcNow
        });
    }

    private static PrismStatusSnapshot? TryRead()
    {
        try
        {
            return AtomicJsonFileStore.Read<PrismStatusSnapshot>(PrismPaths.StatusPath);
        }
        catch
        {
            return null;
        }
    }
}

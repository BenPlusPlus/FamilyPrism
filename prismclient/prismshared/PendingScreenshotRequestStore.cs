namespace prismshared;

public static class PendingScreenshotRequestStore
{
    public static bool HasPendingRequest() => File.Exists(PrismPaths.PendingScreenshotRequestPath);

    public static PendingScreenshotRequestPayload? Read()
    {
        return AtomicJsonFileStore.Read<PendingScreenshotRequestPayload>(PrismPaths.PendingScreenshotRequestPath);
    }

    public static void Write(PendingScreenshotRequestPayload payload)
    {
        MachineConfigurationStore.EnsureStateDirectory();
        AtomicJsonFileStore.Write(PrismPaths.PendingScreenshotRequestPath, payload);
    }

    public static void Delete()
    {
        if (File.Exists(PrismPaths.PendingScreenshotRequestPath))
        {
            File.Delete(PrismPaths.PendingScreenshotRequestPath);
        }
    }
}

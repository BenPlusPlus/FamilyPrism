namespace prismshared;

public static class PendingSetupStore
{
    public static bool HasPendingSetup() => GetMostRecentPendingSetupPath() is not null;

    public static string Write(PendingSetupPayload payload)
    {
        Directory.CreateDirectory(PrismPaths.PendingSetupDirectory);

        var path = Path.Combine(
            PrismPaths.PendingSetupDirectory,
            $"pending-setup-{Guid.NewGuid():N}.json");

        AtomicJsonFileStore.Write(path, payload);
        return path;
    }

    public static PendingSetupPayload Read(string path)
    {
        var payload = AtomicJsonFileStore.Read<PendingSetupPayload>(path);
        return payload ?? throw new InvalidOperationException("The pending setup payload could not be read.");
    }

    public static void Delete(string path)
    {
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }

    public static string? GetMostRecentPendingSetupPath()
    {
        if (!Directory.Exists(PrismPaths.PendingSetupDirectory))
        {
            return null;
        }

        return Directory
            .GetFiles(PrismPaths.PendingSetupDirectory, "pending-setup-*.json", SearchOption.TopDirectoryOnly)
            .OrderByDescending(File.GetLastWriteTimeUtc)
            .FirstOrDefault();
    }
}

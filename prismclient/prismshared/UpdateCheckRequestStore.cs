namespace prismshared;

/// <summary>
/// The tray (running as the signed-in user) asks the service to check for an update by dropping
/// a request file in the shared State directory. The service picks it up and deletes it.
/// </summary>
public static class UpdateCheckRequestStore
{
    /// <summary>Requests older than this are ignored, e.g. one written while the service was stopped.</summary>
    /// <summary>Status text the service publishes while a requested check is running.</summary>
    public const string InProgressMessage = "Checking for updates...";

    public static readonly TimeSpan MaxRequestAge = TimeSpan.FromMinutes(5);

    /// <remarks>
    /// Called from the tray as a standard user, so this must not touch the directory ACL.
    /// The service creates the State directory (with Users: Modify) when it first writes status.
    /// </remarks>
    public static void Write(DateTimeOffset requestedAtUtc)
    {
        AtomicJsonFileStore.Write(PrismPaths.UpdateCheckRequestPath, new UpdateCheckRequestPayload(requestedAtUtc));
    }

    /// <summary>Consumes a pending request. Returns true if a fresh request was waiting.</summary>
    public static bool TryTake(DateTimeOffset now) => TryTake(PrismPaths.UpdateCheckRequestPath, now);

    internal static bool TryTake(string path, DateTimeOffset now)
    {
        if (!File.Exists(path))
        {
            return false;
        }

        UpdateCheckRequestPayload? request = null;
        try
        {
            request = AtomicJsonFileStore.Read<UpdateCheckRequestPayload>(path);
        }
        catch
        {
        }

        try
        {
            File.Delete(path);
        }
        catch
        {
        }

        return request is not null
            && request.RequestedAtUtc <= now.AddMinutes(1)
            && now - request.RequestedAtUtc <= MaxRequestAge;
    }
}

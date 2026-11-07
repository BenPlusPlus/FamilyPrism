namespace prismshared;

internal sealed record DnsOverlayPersistedState(
    string CommandId,
    string RestoreCommandId,
    string? ProfileName,
    string? PrimaryIp,
    string? SecondaryIp,
    bool StandingResetToDhcp,
    string? StandingProfileName,
    string? StandingPrimaryIp,
    string? StandingSecondaryIp,
    DateTimeOffset ExpiresAtUtc,
    long RemainingMs,
    long LastTickMs,
    bool StandingRestored = false)
{
    public bool HasStandingProfile => !string.IsNullOrWhiteSpace(StandingPrimaryIp);
}

internal static class DnsOverlayStateStore
{
    public static DnsOverlayPersistedState? Read(string? path = null)
    {
        return AtomicJsonFileStore.Read<DnsOverlayPersistedState>(path ?? PrismPaths.DnsOverlayPath);
    }

    public static void Write(DnsOverlayPersistedState state, string? path = null)
    {
        AtomicJsonFileStore.Write(path ?? PrismPaths.DnsOverlayPath, state);
    }

    public static void Clear(string? path = null)
    {
        var overlayPath = path ?? PrismPaths.DnsOverlayPath;
        if (File.Exists(overlayPath))
        {
            File.Delete(overlayPath);
        }
    }

    public static DnsOverlayPersistedState FromCommand(
        ApplyDnsCommand command,
        TimeSpan remaining,
        long nowTickMs)
    {
        var standing = command.Standing;
        return new DnsOverlayPersistedState(
            command.CommandId,
            command.RestoreCommandId ?? command.CommandId,
            command.ProfileName,
            command.PrimaryIp,
            command.SecondaryIp,
            standing is null || standing.ResetToDhcp,
            standing?.ProfileName,
            standing?.PrimaryIp,
            standing?.SecondaryIp,
            command.ExpiresAt ?? DateTimeOffset.UtcNow,
            (long)Math.Max(0, remaining.TotalMilliseconds),
            nowTickMs);
    }
}

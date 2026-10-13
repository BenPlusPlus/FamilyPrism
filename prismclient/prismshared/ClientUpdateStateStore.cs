namespace prismshared;

public static class ClientUpdateStateStore
{
    public static readonly TimeSpan InitialBackoff = TimeSpan.FromMinutes(15);

    public static readonly TimeSpan MaxBackoff = TimeSpan.FromHours(6);

    public static ClientUpdateState Read(string path)
    {
        return AtomicJsonFileStore.Read<ClientUpdateState>(path) ?? new ClientUpdateState();
    }

    public static void Write(string path, ClientUpdateState state)
    {
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        AtomicJsonFileStore.Write(path, state);
    }

    public static ClientUpdatePin? GetFailedPin(ClientUpdateState state)
    {
        if (string.IsNullOrWhiteSpace(state.FailedVersion) || string.IsNullOrWhiteSpace(state.FailedSha256))
        {
            return null;
        }

        return new ClientUpdatePin(state.FailedVersion, state.FailedSha256);
    }

    public static bool IsInBackoff(ClientUpdateState state, ClientUpdatePackage package, DateTimeOffset now)
    {
        if (state.LastFailureAtUtc is null || state.NextRetryDelaySeconds <= 0)
        {
            return false;
        }

        if (!IsSamePin(state.BackoffVersion, state.BackoffSha256, package))
        {
            return false;
        }

        var delay = TimeSpan.FromSeconds(Math.Clamp(
            state.NextRetryDelaySeconds,
            InitialBackoff.TotalSeconds,
            MaxBackoff.TotalSeconds));
        return now < state.LastFailureAtUtc.Value + delay;
    }

    public static ClientUpdateState RecordTransientFailure(ClientUpdateState state, ClientUpdatePackage package)
    {
        var samePin = IsSamePin(state.BackoffVersion, state.BackoffSha256, package);
        var nextDelay = samePin
            ? Math.Min(Math.Max(state.NextRetryDelaySeconds * 2, (int)InitialBackoff.TotalSeconds), (int)MaxBackoff.TotalSeconds)
            : (int)InitialBackoff.TotalSeconds;

        return state with
        {
            LastFailureAtUtc = DateTimeOffset.UtcNow,
            NextRetryDelaySeconds = nextDelay,
            BackoffVersion = package.Version,
            BackoffSha256 = package.Sha256
        };
    }

    public static ClientUpdateState RecordFailedPin(ClientUpdateState state, ClientUpdatePackage package)
    {
        return RecordTransientFailure(state, package) with
        {
            FailedVersion = package.Version,
            FailedSha256 = package.Sha256
        };
    }

    public static ClientUpdateState RecordFailedPin(ClientUpdateState state, ClientUpdatePlan plan)
    {
        return RecordFailedPin(
            state,
            new ClientUpdatePackage(
                ClientUpdatePlanner.SupportedKind,
                ClientUpdatePlanner.UnderstoodLayoutGeneration,
                plan.Sha256,
                string.Empty,
                plan.Version));
    }

    private static bool IsSamePin(string? version, string? sha256, ClientUpdatePackage package)
    {
        return string.Equals(version, package.Version, StringComparison.OrdinalIgnoreCase)
            && string.Equals(sha256, package.Sha256, StringComparison.OrdinalIgnoreCase);
    }
}

namespace prismshared;

public static class ClientUpdateStateStore
{
    public static readonly TimeSpan InitialBackoff = ClientUpdateSchedule.InitialBackoff;

    public static readonly TimeSpan MaxBackoff = ClientUpdateSchedule.MaxBackoff;

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

    public static bool IsInBackoff(ClientUpdateState state, DateTimeOffset now)
    {
        if (state.LastFailureAtUtc is null || state.NextRetryDelaySeconds <= 0)
        {
            return false;
        }

        var delay = TimeSpan.FromSeconds(Math.Clamp(
            state.NextRetryDelaySeconds,
            InitialBackoff.TotalSeconds,
            MaxBackoff.TotalSeconds));
        return now < state.LastFailureAtUtc.Value + delay;
    }

    public static ClientUpdateState RecordSuccess(ClientUpdateState state, DateTimeOffset now)
    {
        return state with
        {
            LastSuccessfulCheckAtUtc = now,
            LastFailureAtUtc = null,
            NextRetryDelaySeconds = 0,
            BackoffVersion = null,
            BackoffSha256 = null
        };
    }

    public static ClientUpdateState RecordTransientFailure(
        ClientUpdateState state,
        DateTimeOffset now,
        ClientUpdatePackage? package = null)
    {
        var nextDelay = state.NextRetryDelaySeconds > 0
            ? Math.Min(state.NextRetryDelaySeconds * 2, (int)MaxBackoff.TotalSeconds)
            : (int)InitialBackoff.TotalSeconds;

        return state with
        {
            LastFailureAtUtc = now,
            NextRetryDelaySeconds = nextDelay,
            BackoffVersion = package?.Version ?? state.BackoffVersion,
            BackoffSha256 = package?.Sha256 ?? state.BackoffSha256
        };
    }

    public static ClientUpdateState RecordFailedPin(
        ClientUpdateState state,
        ClientUpdatePackage package,
        DateTimeOffset? now = null)
    {
        return RecordTransientFailure(state, now ?? DateTimeOffset.UtcNow, package) with
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
}

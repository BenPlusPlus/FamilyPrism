namespace prismshared;

public enum ClientUpdateCheckTrigger
{
    Start,
    WebsocketConnect,
    Periodic,
    Retry,
    Manual
}

public static class ClientUpdateSchedule
{
    public static readonly TimeSpan PeriodicCheckInterval = TimeSpan.FromHours(6);

    public static readonly TimeSpan ReconnectDebounce = TimeSpan.FromMinutes(15);

    public static readonly TimeSpan InitialBackoff = TimeSpan.FromMinutes(15);

    public static readonly TimeSpan MaxBackoff = TimeSpan.FromHours(6);

    /// <summary>
    /// How often the service wakes to retry a failed check once its backoff has expired.
    /// Without this, a failure would wait for the next 6-hour periodic tick.
    /// </summary>
    public static readonly TimeSpan RetryPollInterval = InitialBackoff;

    public static bool ShouldCheck(
        ClientUpdateCheckTrigger trigger,
        ClientUpdateState state,
        DateTimeOffset now)
    {
        if (trigger is ClientUpdateCheckTrigger.Start or ClientUpdateCheckTrigger.Manual)
        {
            return true;
        }

        if (ClientUpdateStateStore.IsInBackoff(state, now))
        {
            return false;
        }

        if (trigger == ClientUpdateCheckTrigger.Retry)
        {
            return state.LastFailureAtUtc is not null;
        }

        if (trigger == ClientUpdateCheckTrigger.WebsocketConnect
            && state.LastSuccessfulCheckAtUtc is DateTimeOffset lastSuccess
            && now - lastSuccess < ReconnectDebounce)
        {
            return false;
        }

        return true;
    }
}

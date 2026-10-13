namespace prismshared;

public enum ClientUpdateCheckTrigger
{
    Start,
    WebsocketConnect,
    Periodic
}

public static class ClientUpdateSchedule
{
    public static readonly TimeSpan PeriodicCheckInterval = TimeSpan.FromHours(6);

    public static readonly TimeSpan ReconnectDebounce = TimeSpan.FromMinutes(15);

    public static readonly TimeSpan InitialBackoff = TimeSpan.FromMinutes(15);

    public static readonly TimeSpan MaxBackoff = TimeSpan.FromHours(6);

    public static bool ShouldCheck(
        ClientUpdateCheckTrigger trigger,
        ClientUpdateState state,
        DateTimeOffset now)
    {
        if (trigger == ClientUpdateCheckTrigger.Start)
        {
            return true;
        }

        if (ClientUpdateStateStore.IsInBackoff(state, now))
        {
            return false;
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

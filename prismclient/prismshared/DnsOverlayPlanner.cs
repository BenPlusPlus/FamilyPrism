namespace prismshared;

internal enum DnsOverlayPlanKind
{
    ApplyIndefinite,
    ApplyOverlay,
    ExtendOverlay,
    SkipExpired
}

internal sealed record DnsOverlayPlan(
    DnsOverlayPlanKind Kind,
    TimeSpan Remaining);

internal static class DnsOverlayPlanner
{
    public static DnsOverlayPlan Plan(
        ApplyDnsCommand command,
        DnsOverlayPersistedState? current,
        DateTimeOffset nowUtc)
    {
        if (command.ExpiresAt is null)
        {
            return new DnsOverlayPlan(DnsOverlayPlanKind.ApplyIndefinite, TimeSpan.Zero);
        }

        var utcRemaining = command.ExpiresAt.Value - nowUtc;
        if (utcRemaining < TimeSpan.Zero)
        {
            utcRemaining = TimeSpan.Zero;
        }

        // Once standing DNS is back, the overlay is no longer on the adapter, so the same command
        // arriving again must apply it in full rather than only move the deadline.
        if (current is not null
            && !current.StandingRestored
            && string.Equals(current.CommandId, command.CommandId, StringComparison.Ordinal)
            && utcRemaining > TimeSpan.Zero)
        {
            return new DnsOverlayPlan(DnsOverlayPlanKind.ExtendOverlay, utcRemaining);
        }

        if (utcRemaining <= TimeSpan.Zero)
        {
            return new DnsOverlayPlan(DnsOverlayPlanKind.SkipExpired, TimeSpan.Zero);
        }

        return new DnsOverlayPlan(DnsOverlayPlanKind.ApplyOverlay, utcRemaining);
    }
}

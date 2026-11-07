namespace prismshared;

internal static class DnsOverlayRemaining
{
    public static TimeSpan Compute(
        TimeSpan persistedRemaining,
        long persistedTickMs,
        long nowTickMs,
        DateTimeOffset expiresAtUtc,
        DateTimeOffset nowUtc)
    {
        var tickDelta = nowTickMs - persistedTickMs;
        var monotonicElapsed = tickDelta <= 0 ? TimeSpan.Zero : TimeSpan.FromMilliseconds(tickDelta);
        var monotonicRemaining = persistedRemaining - monotonicElapsed;
        if (monotonicRemaining < TimeSpan.Zero)
        {
            monotonicRemaining = TimeSpan.Zero;
        }

        var utcRemaining = expiresAtUtc - nowUtc;
        if (utcRemaining < TimeSpan.Zero)
        {
            utcRemaining = TimeSpan.Zero;
        }

        var remaining = monotonicRemaining < utcRemaining ? monotonicRemaining : utcRemaining;
        return remaining > persistedRemaining ? persistedRemaining : remaining;
    }
}

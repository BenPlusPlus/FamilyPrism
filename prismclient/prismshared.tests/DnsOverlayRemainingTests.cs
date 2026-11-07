using prismshared;

namespace prismshared.tests;

public class DnsOverlayRemainingTests
{
    private static readonly DateTimeOffset Deadline = DateTimeOffset.Parse("2026-03-01T12:15:00Z");
    private static readonly TimeSpan FifteenMinutes = TimeSpan.FromMinutes(15);

    [Fact]
    public void ClockSetBackDoesNotIncreaseRemaining()
    {
        var remaining = DnsOverlayRemaining.Compute(
            FifteenMinutes,
            persistedTickMs: 10_000,
            nowTickMs: 20_000,
            Deadline,
            nowUtc: Deadline.AddMinutes(-30));

        Assert.Equal(TimeSpan.FromMinutes(15) - TimeSpan.FromSeconds(10), remaining);
    }

    [Fact]
    public void ClockSetForwardCanOnlyShortenRemaining()
    {
        var remaining = DnsOverlayRemaining.Compute(
            FifteenMinutes,
            persistedTickMs: 10_000,
            nowTickMs: 20_000,
            Deadline,
            nowUtc: Deadline.AddMinutes(1));

        Assert.Equal(TimeSpan.Zero, remaining);
    }

    [Fact]
    public void RebootTickResetDoesNotAddTime()
    {
        var remaining = DnsOverlayRemaining.Compute(
            TimeSpan.FromMinutes(5),
            persistedTickMs: 8_000_000,
            nowTickMs: 2_000,
            Deadline,
            nowUtc: Deadline.AddMinutes(-5));

        Assert.Equal(TimeSpan.FromMinutes(5), remaining);
    }

    [Fact]
    public void HonestUtcDeadlineExpiresThroughSleep()
    {
        var remaining = DnsOverlayRemaining.Compute(
            FifteenMinutes,
            persistedTickMs: 10_000,
            nowTickMs: 10_500,
            Deadline,
            nowUtc: Deadline.AddSeconds(1));

        Assert.Equal(TimeSpan.Zero, remaining);
    }
}

using prismshared;

namespace prismshared.tests;

public class DnsProfileNoticeTests
{
    [Fact]
    public void IndefiniteApplyNamesTheNewProfile()
    {
        var command = Command(expiresAt: null, standing: null);

        Assert.Equal("Internet profile is now Open.", DnsProfileNotice.Applied(command, TimeSpan.Zero));
    }

    [Fact]
    public void ResetToDhcpUsesAutomatic()
    {
        var command = new ApplyDnsCommand("cmd-1", ResetToDhcp: true, null, null, null);

        Assert.Equal("Internet profile is now Automatic.", DnsProfileNotice.Applied(command, TimeSpan.Zero));
    }

    [Fact]
    public void TimedApplyIncludesStandingAndMinutes()
    {
        var command = Command(DateTimeOffset.Parse("2026-03-01T12:15:00Z"));

        Assert.Equal(
            "Internet profile is now Open. Will return to School in 15 minutes.",
            DnsProfileNotice.Applied(command, TimeSpan.FromMinutes(15)));
    }

    [Fact]
    public void TimedApplyWithoutStandingUsesWindowsDefault()
    {
        var command = Command(DateTimeOffset.Parse("2026-03-01T12:05:00Z"), standing: null);

        Assert.Equal(
            "Internet profile is now Open. Will return to Windows default in 5 minutes.",
            DnsProfileNotice.Applied(command, TimeSpan.FromMinutes(5)));
    }

    [Fact]
    public void ExtendIncludesAddedAndRemainingMinutes()
    {
        var command = Command(DateTimeOffset.Parse("2026-03-01T12:22:00Z"));

        Assert.Equal(
            "Open has been extended by 15 minutes. Will return to School in 22 minutes.",
            DnsProfileNotice.Extended(command, TimeSpan.FromMinutes(15), TimeSpan.FromMinutes(22)));
    }

    [Fact]
    public void RestoreUsesStandingProfileName()
    {
        var state = DnsOverlayStateStore.FromCommand(
            Command(DateTimeOffset.Parse("2026-03-01T12:15:00Z")),
            TimeSpan.Zero,
            1);

        Assert.Equal("Internet profile is now School.", DnsProfileNotice.Restored(state));
    }

    [Fact]
    public void OneMinuteUsesSingular()
    {
        var command = Command(DateTimeOffset.Parse("2026-03-01T12:01:00Z"));

        Assert.Equal(
            "Internet profile is now Open. Will return to School in 1 minute.",
            DnsProfileNotice.Applied(command, TimeSpan.FromMinutes(1)));
    }

    private static ApplyDnsCommand Command(DateTimeOffset? expiresAt, ApplyDnsStanding? standing)
    {
        return new ApplyDnsCommand(
            "overlay-1",
            ResetToDhcp: false,
            "Open",
            "8.8.8.8",
            "8.8.4.4",
            expiresAt,
            "restore-1",
            standing);
    }

    private static ApplyDnsCommand Command(DateTimeOffset? expiresAt = null)
    {
        return Command(expiresAt, new ApplyDnsStanding(false, "School", "1.1.1.1", "1.0.0.1"));
    }
}

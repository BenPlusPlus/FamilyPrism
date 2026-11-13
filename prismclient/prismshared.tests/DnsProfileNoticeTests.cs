using System.Text.Json;
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

    [Fact]
    public void TimedNoInternetNamesItAndTheStandingProfile()
    {
        var command = NoInternet(
            DateTimeOffset.Parse("2026-03-01T12:30:00Z"),
            new ApplyDnsStanding(false, "School", "1.1.1.1", "1.0.0.1"));

        Assert.Equal(
            "Internet profile is now No internet. Will return to School in 30 minutes.",
            DnsProfileNotice.Applied(command, TimeSpan.FromMinutes(30)));
    }

    [Fact]
    public void ProfileOverStandingNoInternetReturnsToNoInternet()
    {
        var command = Command(
            DateTimeOffset.Parse("2026-03-01T12:30:00Z"),
            new ApplyDnsStanding(false, null, null, null, BlockInternet: true));
        var state = DnsOverlayStateStore.FromCommand(command, TimeSpan.Zero, 1);

        Assert.Equal(
            "Internet profile is now Open. Will return to No internet in 30 minutes.",
            DnsProfileNotice.Applied(command, TimeSpan.FromMinutes(30)));
        Assert.Equal("Internet profile is now No internet.", DnsProfileNotice.Restored(state));
    }

    [Fact]
    public void ServerApplyDnsMessageCarriesNoInternet()
    {
        // The shape prism-api sends (app/data/dns-directives.ts toPayload).
        var command = JsonSerializer.Deserialize<ApplyDnsCommand>(
            """
            {
              "type": "apply-dns",
              "commandId": "cmd-1",
              "blockInternet": true,
              "resetToDhcp": false,
              "profileName": null,
              "primaryIp": null,
              "secondaryIp": null,
              "expiresAt": "2026-03-01T12:30:00.000Z",
              "restoreCommandId": "restore-1",
              "standing": {
                "blockInternet": false,
                "resetToDhcp": false,
                "profileName": "School",
                "primaryIp": "1.1.1.1",
                "secondaryIp": null
              }
            }
            """,
            new JsonSerializerOptions(JsonSerializerDefaults.Web))!;

        Assert.True(command.BlockInternet);
        Assert.False(command.Standing!.BlockInternet);
        Assert.Equal("School", command.Standing.ProfileName);
    }

    private static ApplyDnsCommand NoInternet(DateTimeOffset? expiresAt, ApplyDnsStanding? standing)
    {
        return new ApplyDnsCommand(
            "overlay-1",
            ResetToDhcp: false,
            ProfileName: null,
            PrimaryIp: null,
            SecondaryIp: null,
            expiresAt,
            "restore-1",
            standing,
            BlockInternet: true);
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

using System.Text.Json;
using prismshared;

namespace prismshared.tests;

public class DnsOverlayPlannerTests
{
    private static readonly DateTimeOffset Now = DateTimeOffset.Parse("2026-03-01T12:00:00Z");

    [Fact]
    public void MissingDeadlineIsIndefinite()
    {
        var plan = DnsOverlayPlanner.Plan(Command(), current: null, Now);

        Assert.Equal(DnsOverlayPlanKind.ApplyIndefinite, plan.Kind);
    }

    [Fact]
    public void FutureDeadlineAppliesOverlay()
    {
        var plan = DnsOverlayPlanner.Plan(Command(Now.AddMinutes(15)), current: null, Now);

        Assert.Equal(DnsOverlayPlanKind.ApplyOverlay, plan.Kind);
        Assert.Equal(TimeSpan.FromMinutes(15), plan.Remaining);
    }

    [Fact]
    public void SameCommandIdWithTimeLeftIsExtend()
    {
        var command = Command(Now.AddMinutes(22));
        var current = DnsOverlayStateStore.FromCommand(Command(Now.AddMinutes(7)), TimeSpan.FromMinutes(7), 1);

        var plan = DnsOverlayPlanner.Plan(command, current, Now);

        Assert.Equal(DnsOverlayPlanKind.ExtendOverlay, plan.Kind);
        Assert.Equal(TimeSpan.FromMinutes(22), plan.Remaining);
    }

    [Fact]
    public void OverlayJsonDeserializesDeadlineAndStanding()
    {
        const string json = """
            {
              "commandId": "overlay-1",
              "resetToDhcp": false,
              "profileName": "Open",
              "primaryIp": "8.8.8.8",
              "secondaryIp": "8.8.4.4",
              "expiresAt": "2026-03-01T12:15:00.000Z",
              "restoreCommandId": "restore-1",
              "standing": {
                "resetToDhcp": false,
                "profileName": "School",
                "primaryIp": "1.1.1.1",
                "secondaryIp": "1.0.0.1"
              },
              "type": "apply-dns"
            }
            """;

        var command = JsonSerializer.Deserialize<ApplyDnsCommand>(
            json,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.NotNull(command);
        Assert.Equal("overlay-1", command!.CommandId);
        Assert.Equal(DateTimeOffset.Parse("2026-03-01T12:15:00Z"), command.ExpiresAt);
        Assert.Equal("restore-1", command.RestoreCommandId);
        Assert.Equal("1.1.1.1", command.Standing?.PrimaryIp);
        Assert.Equal("School", command.Standing?.ProfileName);
    }

    [Fact]
    public void ExpiredOverlayIsSkipped()
    {
        var plan = DnsOverlayPlanner.Plan(Command(Now.AddMinutes(-1)), current: null, Now);

        Assert.Equal(DnsOverlayPlanKind.SkipExpired, plan.Kind);
        Assert.Equal(TimeSpan.Zero, plan.Remaining);
    }

    private static ApplyDnsCommand Command(DateTimeOffset? expiresAt = null)
    {
        return new ApplyDnsCommand(
            "overlay-1",
            ResetToDhcp: false,
            "Open",
            "8.8.8.8",
            "8.8.4.4",
            expiresAt,
            "restore-1",
            new ApplyDnsStanding(false, "School", "1.1.1.1", "1.0.0.1"));
    }
}

using System.Text.Json;

namespace prismbridge.tests;

public class BridgeProtocolTests
{
    private static readonly DateTimeOffset LocalNow = new(2026, 11, 15, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public void DesiredStateIsReadWithNormalizedAddressesAndTheServerClockOffset()
    {
        var json = """
            {"type":"desired-state","serverTime":"2026-11-15T10:00:30.000Z","devices":[
              {"id":"d1","name":"Switch","macs":["3C:a9:F4:10:20:ab","3C-A9-F4-10-20-AB","nope"],"standing":"blocked",
               "timed":{"access":"allowed","expiresAt":"2026-11-15T10:30:00.000Z"}},
              {"id":"d2","name":"iPad","macs":["FA-12-34-56-78-9A"],"standing":"allowed","timed":null}]}
            """;

        var message = Assert.IsType<ServerMessage.Desired>(BridgeProtocol.Parse(json, LocalNow));

        Assert.Equal(TimeSpan.FromSeconds(30), message.State.ClockOffset);
        var device = message.State.Devices[0];
        Assert.Equal(["3C-A9-F4-10-20-AB"], device.Macs);
        Assert.Equal(DeviceAccess.Blocked, device.Standing);
        Assert.Equal(DeviceAccess.Allowed, device.Timed?.Access);
        Assert.Null(message.State.Devices[1].Timed);
    }

    [Fact]
    public void UnknownOrBrokenMessagesAreIgnored()
    {
        Assert.Null(BridgeProtocol.Parse("""{"type":"apply-dns"}""", LocalNow));
        Assert.Null(BridgeProtocol.Parse("not json", LocalNow));
        Assert.Null(BridgeProtocol.Parse("""{"type":"desired-state","devices":[{"id":"x"}]}""", LocalNow));
        Assert.IsType<ServerMessage.ReconcileNow>(BridgeProtocol.Parse("""{"type":"reconcile-now"}""", LocalNow));
    }

    [Fact]
    public void ReportsUseTheServersCodes()
    {
        var report = new ReconcileReport(
            [new RouterEntry("Switch", "3C-A9-F4-10-20-AB")],
            [new DeviceFailure("d1", DeviceFailureCode.ProtectedMac), new DeviceFailure("d2", DeviceFailureCode.TableFull)],
            null);

        using var json = JsonDocument.Parse(BridgeProtocol.Report(report));
        var root = json.RootElement;

        Assert.Equal("reconcile-report", root.GetProperty("type").GetString());
        Assert.Equal("3C-A9-F4-10-20-AB", root.GetProperty("entries")[0].GetProperty("mac").GetString());
        Assert.Equal(["protected-mac", "table-full"], root.GetProperty("deviceErrors").EnumerateArray().Select(error => error.GetProperty("code").GetString()));
        Assert.Equal(JsonValueKind.Null, root.GetProperty("error").ValueKind);
        Assert.False(root.GetProperty("deviceErrors")[0].TryGetProperty("message", out _));
    }

    [Fact]
    public void AFailedPassSendsNoTable()
    {
        using var json = JsonDocument.Parse(BridgeProtocol.Report(ReconcileReport.Failed(new BridgeFailure(BridgeFailureCode.LoginFailed, "No."))));

        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("entries").ValueKind);
        Assert.Equal("login-failed", json.RootElement.GetProperty("error").GetProperty("code").GetString());
    }

    [Fact]
    public void TheSavedDesiredStateSurvivesARestart()
    {
        var path = Path.Combine(Path.GetTempPath(), $"prismbridge-{Guid.NewGuid():N}", "desired-state.json");
        try
        {
            var state = new DesiredState(
                [new DesiredDevice("d1", "Switch", ["3C-A9-F4-10-20-AB"], DeviceAccess.Blocked, new TimedAccess(DeviceAccess.Allowed, LocalNow.AddMinutes(15)))],
                TimeSpan.FromSeconds(-12),
                LocalNow);
            var store = new DesiredStateStore(path);

            store.Save(state);
            var loaded = store.Load();

            Assert.Equal(state.ClockOffset, loaded.ClockOffset);
            Assert.Equal(state.Devices[0].Timed, loaded.Devices[0].Timed);
            Assert.Equal(state.Devices[0].Macs, loaded.Devices[0].Macs);
            Assert.Equal(DeviceAccess.Allowed, loaded.Devices[0].AccessAt(LocalNow.AddMinutes(14)));
        }
        finally
        {
            Directory.Delete(Path.GetDirectoryName(path)!, recursive: true);
        }
    }
}

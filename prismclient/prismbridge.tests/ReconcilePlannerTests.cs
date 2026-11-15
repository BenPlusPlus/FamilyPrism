namespace prismbridge.tests;

public class ReconcilePlannerTests
{
    private const string SwitchLan = "3C-A9-F4-10-20-AB";
    private const string SwitchWifi = "3C-A9-F4-10-20-9E";
    private const string Ipad = "FA-12-34-56-78-9A";
    private const string Unmanaged = "B6-12-34-56-78-9B";
    private static readonly DateTimeOffset Now = new(2026, 11, 15, 10, 0, 0, TimeSpan.Zero);
    private static readonly IReadOnlySet<string> NoProtected = new HashSet<string>();

    private static DesiredState State(params DesiredDevice[] devices) => new(devices, TimeSpan.Zero, Now);

    private static DesiredDevice Switch(DeviceAccess standing, TimedAccess? timed = null) =>
        new("switch", "Sam's Switch", [SwitchLan, SwitchWifi], standing, timed);

    private static RouterTable Table(params string[] macs) =>
        new(macs.Select(mac => new RouterEntry($"entry_{mac[^2..]}", mac)).ToList(), 80, HostMac: null);

    [Fact]
    public void BlockedDeviceGetsEveryMissingAddressAndUnmanagedEntriesAreLeftAlone()
    {
        var plan = ReconcilePlanner.Plan(State(Switch(DeviceAccess.Blocked)), Table(Unmanaged, SwitchLan), Now, NoProtected);

        Assert.Empty(plan.Deletes);
        Assert.Equal([new PlannedAdd("switch", "Sam_s_Switch", SwitchWifi)], plan.Adds);
    }

    [Fact]
    public void AllowedDevicesAreDeletedHighestPositionFirstSoPositionsDontShift()
    {
        var ipad = new DesiredDevice("ipad", "Kids iPad", [Ipad], DeviceAccess.Allowed, null);
        var plan = ReconcilePlanner.Plan(
            State(Switch(DeviceAccess.Allowed), ipad),
            Table(SwitchLan, Unmanaged, Ipad, SwitchWifi),
            Now,
            NoProtected);

        Assert.Equal([3, 2, 0], plan.Deletes.Select(delete => delete.Index));
        Assert.Equal([SwitchWifi, Ipad, SwitchLan], plan.Deletes.Select(delete => delete.Mac));
        Assert.Empty(plan.Adds);
    }

    [Fact]
    public void ATimedAllowRemovesTheBlockUntilItsDeadlineThenItComesBack()
    {
        var state = State(Switch(DeviceAccess.Blocked, new TimedAccess(DeviceAccess.Allowed, Now.AddMinutes(30))));
        var blockedTable = Table(SwitchLan, SwitchWifi);

        var during = ReconcilePlanner.Plan(state, blockedTable, Now.AddMinutes(29), NoProtected);
        var after = ReconcilePlanner.Plan(state, Table(), Now.AddMinutes(30), NoProtected);

        Assert.Equal(2, during.Deletes.Count);
        Assert.Equal([SwitchLan, SwitchWifi], after.Adds.Select(add => add.Mac));
    }

    [Fact]
    public void DeadlinesAreJudgedOnTheServersClock()
    {
        // This PC is 10 minutes slow: the server says the time limit is over already.
        var state = new DesiredState(
            [Switch(DeviceAccess.Blocked, new TimedAccess(DeviceAccess.Allowed, Now.AddMinutes(5)))],
            TimeSpan.FromMinutes(10),
            Now);

        var plan = ReconcilePlanner.Plan(state, Table(), Now, NoProtected);

        Assert.Equal(2, plan.Adds.Count);
        Assert.Null(state.NextDeadline(Now));

        // A limit ending at server time +20 min ends at +10 min on this slow PC's clock.
        var later = state with { Devices = [Switch(DeviceAccess.Blocked, new TimedAccess(DeviceAccess.Allowed, Now.AddMinutes(20)))] };
        Assert.Equal(Now.AddMinutes(10), later.NextDeadline(Now));
    }

    [Fact]
    public void TheBridgesOwnAddressAndTheRouterAdminPcAreNeverBlocked()
    {
        var bridgePc = new DesiredDevice("pc", "Office PC", ["00-15-5D-01-02-03"], DeviceAccess.Blocked, null);
        var adminPc = new DesiredDevice("admin", "Laptop", ["10-00-00-AA-BB-CC"], DeviceAccess.Blocked, null);
        var table = Table() with { HostMac = "10-00-00-AA-bB-cC" };

        var plan = ReconcilePlanner.Plan(State(bridgePc, adminPc), table, Now, new HashSet<string> { "00:15:5D:01:02:03" });

        Assert.Empty(plan.Adds);
        Assert.Equal(
            [new DeviceFailure("pc", DeviceFailureCode.ProtectedMac), new DeviceFailure("admin", DeviceFailureCode.ProtectedMac)],
            plan.Failures);
    }

    [Fact]
    public void AFullTableCountsTheDeletesFirstAndReportsWhatDidntFit()
    {
        var ipad = new DesiredDevice("ipad", "Kids iPad", [Ipad], DeviceAccess.Allowed, null);
        var table = Table(Ipad, Unmanaged) with { MaxRules = 3 };

        var plan = ReconcilePlanner.Plan(State(ipad, Switch(DeviceAccess.Blocked)), table, Now, NoProtected);

        Assert.Single(plan.Deletes);
        Assert.Equal(2, plan.Adds.Count);

        var full = ReconcilePlanner.Plan(State(Switch(DeviceAccess.Blocked)), Table(Unmanaged, Ipad) with { MaxRules = 3 }, Now, NoProtected);
        Assert.Equal([SwitchLan], full.Adds.Select(add => add.Mac));
        Assert.Equal([new DeviceFailure("switch", DeviceFailureCode.TableFull)], full.Failures);
    }

    [Fact]
    public void RouterEntriesMatchWhateverCaseAndSeparatorsTheyUse()
    {
        var plan = ReconcilePlanner.Plan(
            State(Switch(DeviceAccess.Blocked)),
            Table("3C:a9:F4:10:20:ab", "3C-a9-F4-10-20-9e"),
            Now,
            NoProtected);

        Assert.False(plan.HasChanges);
    }

    [Theory]
    [InlineData("Sam's Switch", "Sam_s_Switch")]
    [InlineData("  Kids' iPad (Wi-Fi)  ", "Kids_iPad_Wi_Fi")]
    [InlineData("??", "FamilyPrism_device")]
    public void RouterNamesKeepToTheRoutersCharacters(string deviceName, string routerName)
    {
        Assert.Equal(routerName, RouterName.From(deviceName));
    }

    [Fact]
    public void RouterNamesAreCutToFiftyCharacters()
    {
        Assert.Equal(RouterName.MaxLength, RouterName.From(new string('a', 80)).Length);
    }
}

namespace prismbridge.tests;

public class RouterDriverTests
{
    private const string SwitchLan = "3C-A9-F4-10-20-AB";
    private const string SwitchWifi = "3C-A9-F4-10-20-9E";
    private const string Ipad = "FA-12-34-56-78-9A";
    private const string Unmanaged = "B6-12-34-56-78-9B";
    private static readonly DateTimeOffset Now = new(2026, 11, 15, 10, 0, 0, TimeSpan.Zero);

    private static TlR600VpnDriver Driver(FakeTlRouter router, string password = "router-pass") =>
        new(new Uri("http://192.168.1.1"), "admin", password, router);

    private sealed class MemoryLoginBlock : ILoginBlockStore
    {
        public BridgeFailure? Current { get; set; }

        public void Block(BridgeFailure failure) => Current = failure;
    }

    [Fact]
    public void ThePasswordIsEncryptedTheRoutersWayPasswordFirstThenZeros()
    {
        var router = new FakeTlRouter();
        var (modulus, exponent) = router.PublicKey;

        var encrypted = TlR600VpnDriver.EncryptPassword("router-pass", modulus, exponent);

        Assert.Equal(modulus.Length, encrypted.Length);
        Assert.Equal("router-pass", router.Decrypt(encrypted));
        // No random padding: the same password always encrypts the same way.
        Assert.Equal(encrypted, TlR600VpnDriver.EncryptPassword("router-pass", modulus, exponent));
    }

    [Fact]
    public async Task ASessionReadsAddsAndDeletesByPositionAndLogsOut()
    {
        var router = new FakeTlRouter();
        router.Entries.Add(new RouterEntry("Old", Unmanaged));

        await using (var session = await Driver(router).OpenAsync(CancellationToken.None))
        {
            await session.AddAsync(1, "Switch", SwitchLan, CancellationToken.None);
            var table = await session.ReadTableAsync(CancellationToken.None);
            Assert.Equal([Unmanaged, SwitchLan], table.Entries.Select(entry => entry.Mac));
            Assert.Equal("10-00-00-AA-BB-CC", table.HostMac);

            await session.DeleteAsync(0, CancellationToken.None);
        }

        Assert.Equal([SwitchLan], router.Entries.Select(entry => entry.Mac));
        Assert.Equal(1, router.Logouts);
    }

    [Fact]
    public async Task AWrongPasswordIsALoginFailure()
    {
        var exception = await Assert.ThrowsAsync<RouterException>(() => Driver(new FakeTlRouter(), "wrong-pass").OpenAsync(CancellationToken.None));

        Assert.Equal(BridgeFailureCode.LoginFailed, exception.Code);
    }

    [Fact]
    public async Task AnAllowlistFilterIsRefusedBecauseAddingWouldLetDevicesIn()
    {
        var router = new FakeTlRouter { FilterMode = "white" };
        await using var session = await Driver(router).OpenAsync(CancellationToken.None);

        var exception = await Assert.ThrowsAsync<RouterException>(() => session.ReadTableAsync(CancellationToken.None));

        Assert.Equal(BridgeFailureCode.Unexpected, exception.Code);
        Assert.Contains("blocklist", exception.Message);
    }

    [Fact]
    public async Task ARouterThatCantBeReachedIsUnreachable()
    {
        var exception = await Assert.ThrowsAsync<RouterException>(() => Driver(new FakeTlRouter { Offline = true }).OpenAsync(CancellationToken.None));

        Assert.Equal(BridgeFailureCode.Unreachable, exception.Code);
    }

    [Fact]
    public async Task APassMakesTheRouterMatchAndReportsTheTableItLeft()
    {
        var router = new FakeTlRouter();
        router.Entries.AddRange([new RouterEntry("Kids_iPad", Ipad), new RouterEntry("Switch_Alex_Lan", Unmanaged)]);
        var state = new DesiredState(
            [
                new DesiredDevice("switch", "Sam's Switch", [SwitchLan, SwitchWifi], DeviceAccess.Blocked, null),
                new DesiredDevice("ipad", "Kids iPad", [Ipad], DeviceAccess.Allowed, null)
            ],
            TimeSpan.Zero,
            Now);
        var reconciler = new BridgeReconciler(Driver(router), new MemoryLoginBlock(), () => new HashSet<string>());

        var report = await reconciler.RunAsync(state, Now, CancellationToken.None);

        Assert.Null(report.Error);
        Assert.Equal([Unmanaged, SwitchLan, SwitchWifi], router.Entries.Select(entry => entry.Mac));
        Assert.Equal(router.Entries, report.Entries);
        Assert.Equal("Sam_s_Switch", router.Entries[1].Name);
        Assert.Equal(router.Logins, router.Logouts);
    }

    [Fact]
    public async Task AFailedLoginStopsFurtherLoginsUntilTheBlockIsCleared()
    {
        var router = new FakeTlRouter { Password = "changed-on-router" };
        var block = new MemoryLoginBlock();
        var reconciler = new BridgeReconciler(Driver(router), block, () => new HashSet<string>());

        var first = await reconciler.RunAsync(DesiredState.Empty, Now, CancellationToken.None);
        router.Password = "router-pass";
        var second = await reconciler.RunAsync(DesiredState.Empty, Now, CancellationToken.None);

        Assert.Equal(BridgeFailureCode.LoginFailed, first.Error?.Code);
        Assert.Equal(BridgeFailureCode.LoginFailed, second.Error?.Code);
        Assert.Equal(0, router.Logins);

        block.Current = null;
        var third = await reconciler.RunAsync(DesiredState.Empty, Now, CancellationToken.None);
        Assert.Null(third.Error);
        Assert.Equal(1, router.Logins);
    }

    [Fact]
    public async Task ASessionTheRouterEndsMidPassIsRetriedOnceWithAFreshLogin()
    {
        var router = new FakeTlRouter { ExpireNextRead = true };
        var state = new DesiredState(
            [new DesiredDevice("switch", "Switch", [SwitchLan], DeviceAccess.Blocked, null)],
            TimeSpan.Zero,
            Now);
        var reconciler = new BridgeReconciler(Driver(router), new MemoryLoginBlock(), () => new HashSet<string>());

        var report = await reconciler.RunAsync(state, Now, CancellationToken.None);

        Assert.Null(report.Error);
        Assert.Equal(2, router.Logins);
        Assert.Equal([SwitchLan], router.Entries.Select(entry => entry.Mac));
    }
}

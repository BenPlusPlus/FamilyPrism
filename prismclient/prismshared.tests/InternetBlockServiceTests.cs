using System.Net;
using System.Net.Sockets;
using prismshared;

namespace prismshared.tests;

public class InternetBlockServiceTests : IDisposable
{
    private readonly string directory = Path.Combine(Path.GetTempPath(), $"prism-block-{Guid.NewGuid():N}");
    private readonly FakeInternetBlockFirewall firewall = new();
    private readonly FakeResolverAddressSource network = new();
    private IPAddress[] serverAddresses = [IPAddress.Parse("34.1.2.3")];
    private bool lookupFails;

    public void Dispose()
    {
        if (Directory.Exists(directory))
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    [Fact]
    public async Task EnableBlocksEverythingButTheServerAndDisableLiftsIt()
    {
        var service = Service();

        var enabled = await service.EnableAsync(CancellationToken.None);

        Assert.True(enabled.Succeeded);
        Assert.True(service.IsEnabled);
        Assert.False(IsBlocked("34.1.2.3"));
        Assert.True(IsBlocked("34.1.2.4"));

        var disabled = service.Disable();

        Assert.True(disabled.Succeeded);
        Assert.False(service.IsEnabled);
        Assert.Null(firewall.Applied);
    }

    [Fact]
    public async Task EnableThatCannotWriteRulesLeavesNoInternetOff()
    {
        firewall.Fail = true;
        var service = Service();

        var result = await service.EnableAsync(CancellationToken.None);

        Assert.False(result.Succeeded);
        Assert.Contains("Access is denied", result.Error);
        Assert.False(service.IsEnabled);
    }

    [Fact]
    public async Task RefreshRewritesRulesOnlyWhenTheServerMoves()
    {
        var service = Service();
        await service.EnableAsync(CancellationToken.None);

        await service.RefreshAsync(CancellationToken.None);
        Assert.Equal(1, firewall.ApplyCalls);

        serverAddresses = [IPAddress.Parse("66.33.22.11")];
        await service.RefreshAsync(CancellationToken.None);

        Assert.Equal(2, firewall.ApplyCalls);
        Assert.False(IsBlocked("66.33.22.11"));
        // The old address stays open too, so a connection made before the move keeps working.
        Assert.False(IsBlocked("34.1.2.3"));
    }

    [Fact]
    public async Task FailedLookupKeepsTheRememberedServerReachable()
    {
        await Service().EnableAsync(CancellationToken.None);
        lookupFails = true;

        // A Service restart while offline: the rules are rewritten from saved state.
        var result = await Service().ReconcileAsync(CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.Equal(2, firewall.ApplyCalls);
        Assert.False(IsBlocked("34.1.2.3"));
    }

    [Fact]
    public async Task RememberedServerAddressesAreCapped()
    {
        var service = Service();
        await service.EnableAsync(CancellationToken.None);

        for (var last = 10; last < 30; last++)
        {
            serverAddresses = [IPAddress.Parse($"66.33.22.{last}")];
            await service.RefreshAsync(CancellationToken.None);
        }

        Assert.False(IsBlocked("66.33.22.29"));
        Assert.False(IsBlocked($"66.33.22.{30 - InternetBlockService.MaxRememberedServerAddresses}"));
        Assert.True(IsBlocked($"66.33.22.{29 - InternetBlockService.MaxRememberedServerAddresses}"));
        Assert.True(IsBlocked("34.1.2.3"));
    }

    [Fact]
    public async Task ReconcileRemovesRulesLeftBehindWhenNoInternetIsOff()
    {
        firewall.Apply(InternetBlockAddressPlanner.Plan([], [], []));

        var result = await Service().ReconcileAsync(CancellationToken.None);

        Assert.True(result.Succeeded);
        Assert.Null(firewall.Applied);
    }

    [Fact]
    public async Task RefreshDoesNothingWhileNoInternetIsOff()
    {
        await Service().RefreshAsync(CancellationToken.None);

        Assert.Equal(0, firewall.ApplyCalls);
    }

    private bool IsBlocked(string address)
    {
        return BlockedAddresses.Contains(firewall.Applied!.BlockedRemoteAddresses, address);
    }

    private InternetBlockService Service()
    {
        return new InternetBlockService(
            firewall,
            network,
            (_, _) => lookupFails
                ? Task.FromException<IPAddress[]>(new SocketException((int)SocketError.HostNotFound))
                : Task.FromResult(serverAddresses),
            () => "https://prism.example.com/",
            statePath: Path.Combine(directory, "internet-block.json"));
    }
}

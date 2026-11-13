using System.Net;
using prismshared;

namespace prismshared.tests;

public class InternetBlockAddressPlannerTests
{
    private static readonly IPAddress Server = IPAddress.Parse("34.1.2.3");
    private static readonly IPAddress HomeRouter = IPAddress.Parse("192.168.1.1");

    [Theory]
    [InlineData("8.8.8.8")]
    [InlineData("1.1.1.1")]
    [InlineData("34.1.2.2")]
    [InlineData("34.1.2.4")]
    [InlineData("100.64.0.1")]
    [InlineData("2606:4700:4700::1111")]
    [InlineData("2001:db8::1")]
    public void BlocksInternetAddresses(string address)
    {
        var rules = Plan();

        Assert.True(BlockedAddresses.Contains(rules.BlockedRemoteAddresses, address));
    }

    [Theory]
    [InlineData("34.1.2.3")]
    [InlineData("192.168.1.20")]
    [InlineData("10.20.30.40")]
    [InlineData("172.16.0.1")]
    [InlineData("172.31.255.255")]
    [InlineData("169.254.10.10")]
    [InlineData("127.0.0.1")]
    [InlineData("239.255.255.250")]
    [InlineData("255.255.255.255")]
    [InlineData("fe80::1")]
    [InlineData("fd12:3456::1")]
    [InlineData("ff02::fb")]
    [InlineData("::1")]
    public void LeavesTheLocalNetworkAndServerReachable(string address)
    {
        var rules = Plan();

        Assert.False(BlockedAddresses.Contains(rules.BlockedRemoteAddresses, address));
    }

    [Fact]
    public void RangesAreWrittenInFirewallSyntax()
    {
        var rules = Plan();

        Assert.StartsWith(
            "1.0.0.0-9.255.255.255,11.0.0.0-34.1.2.2,34.1.2.4-126.255.255.255,128.0.0.0-169.253.255.255,",
            rules.BlockedRemoteAddresses);
    }

    [Fact]
    public void PublicDnsServersStayReachableForDnsOnly()
    {
        var rules = InternetBlockAddressPlanner.Plan(
            [Server],
            [IPAddress.Parse("1.1.1.3"), HomeRouter, IPAddress.Parse("2606:4700:4700::1113")],
            []);

        Assert.False(BlockedAddresses.Contains(rules.BlockedRemoteAddresses, "1.1.1.3"));
        Assert.True(BlockedAddresses.Contains(rules.BlockedRemoteAddresses, "1.1.1.2"));
        Assert.Equal("1.1.1.3,2606:4700:4700::1113", rules.ResolverAddresses);
    }

    [Fact]
    public void LocalDnsServersNeedNoExtraRules()
    {
        var rules = Plan();

        Assert.Null(rules.ResolverAddresses);
    }

    [Fact]
    public void ServerOnIpv6IsReachable()
    {
        var rules = InternetBlockAddressPlanner.Plan(
            [Server, IPAddress.Parse("2a09:8280:1::3")],
            [HomeRouter],
            []);

        Assert.False(BlockedAddresses.Contains(rules.BlockedRemoteAddresses, "2a09:8280:1::3"));
        Assert.True(BlockedAddresses.Contains(rules.BlockedRemoteAddresses, "2a09:8280:1::4"));
    }

    [Fact]
    public void PublicDhcpServerStaysReachableSoTheLeaseRenews()
    {
        var rules = InternetBlockAddressPlanner.Plan([Server], [HomeRouter], [IPAddress.Parse("68.86.1.1")]);

        Assert.False(BlockedAddresses.Contains(rules.BlockedRemoteAddresses, "68.86.1.1"));
    }

    private static InternetBlockRules Plan()
    {
        return InternetBlockAddressPlanner.Plan([Server], [HomeRouter], [HomeRouter]);
    }
}

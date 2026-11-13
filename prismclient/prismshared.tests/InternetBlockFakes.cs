using System.Net;
using prismshared;

namespace prismshared.tests;

internal sealed class FakeInternetBlockFirewall : IInternetBlockFirewall
{
    /// <summary>The rules currently in the firewall, or null when there are none.</summary>
    public InternetBlockRules? Applied { get; private set; }

    public int ApplyCalls { get; private set; }

    public bool Fail { get; set; }

    public void Apply(InternetBlockRules rules)
    {
        if (Fail)
        {
            throw new InvalidOperationException("Access is denied.");
        }

        ApplyCalls++;
        Applied = rules;
    }

    public void Remove()
    {
        if (Fail)
        {
            throw new InvalidOperationException("Access is denied.");
        }

        Applied = null;
    }
}

internal sealed class FakeResolverAddressSource : IResolverAddressSource
{
    public List<IPAddress> DnsServers { get; } = [IPAddress.Parse("192.168.1.1")];

    public List<IPAddress> DhcpServers { get; } = [IPAddress.Parse("192.168.1.1")];

    public IReadOnlyList<IPAddress> GetDnsServers() => DnsServers;

    public IReadOnlyList<IPAddress> GetDhcpServers() => DhcpServers;
}

/// <summary>Reads a firewall RemoteAddresses list ("a-b,c,...") to ask whether an address is in it.</summary>
internal static class BlockedAddresses
{
    public static bool Contains(string remoteAddresses, string address)
    {
        var target = Number(IPAddress.Parse(address));
        foreach (var entry in remoteAddresses.Split(','))
        {
            var bounds = entry.Split('-');
            var start = Number(IPAddress.Parse(bounds[0]));
            var end = Number(IPAddress.Parse(bounds[^1]));
            if (start.Family == target.Family && target.Value >= start.Value && target.Value <= end.Value)
            {
                return true;
            }
        }

        return false;
    }

    private static (System.Net.Sockets.AddressFamily Family, System.Numerics.BigInteger Value) Number(IPAddress address)
    {
        return (
            address.AddressFamily,
            new System.Numerics.BigInteger(address.GetAddressBytes(), isUnsigned: true, isBigEndian: true));
    }
}

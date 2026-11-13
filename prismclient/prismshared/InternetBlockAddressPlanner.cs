using System.Net;
using System.Net.Sockets;

namespace prismshared;

/// <summary>
/// What the No internet firewall rules block. <see cref="BlockedRemoteAddresses"/> is every
/// address outside the local network, the FamilyPrism server, and the PC's DNS servers.
/// <see cref="ResolverAddresses"/> lists DNS servers outside the local network; those stay
/// reachable for DNS (port 53) only, so the Service can keep looking up the server.
/// </summary>
internal sealed record InternetBlockRules(
    string BlockedRemoteAddresses,
    string? ResolverAddresses);

internal static class InternetBlockAddressPlanner
{
    private static readonly AddressRange[] LocalNetworkV4 =
    [
        Cidr("0.0.0.0/8"),
        Cidr("10.0.0.0/8"),
        Cidr("127.0.0.0/8"),
        Cidr("169.254.0.0/16"),
        Cidr("172.16.0.0/12"),
        Cidr("192.168.0.0/16"),
        Cidr("224.0.0.0/4"),
        Cidr("255.255.255.255/32")
    ];

    private static readonly AddressRange[] LocalNetworkV6 =
    [
        Cidr("::/128"),
        Cidr("::1/128"),
        Cidr("fc00::/7"),
        Cidr("fe80::/10"),
        Cidr("ff00::/8")
    ];

    private static readonly UInt128 MaxV4 = uint.MaxValue;
    private static readonly UInt128 MaxV6 = UInt128.MaxValue;

    public static InternetBlockRules Plan(
        IEnumerable<IPAddress> serverAddresses,
        IEnumerable<IPAddress> resolverAddresses,
        IEnumerable<IPAddress> dhcpServerAddresses)
    {
        var resolvers = Distinct(resolverAddresses)
            .Where(address => !IsLocalNetwork(address))
            .ToArray();

        var allowed = Distinct(serverAddresses)
            .Concat(resolvers)
            .Concat(Distinct(dhcpServerAddresses))
            .ToArray();

        var blockedV4 = Complement(
            LocalNetworkV4.Concat(SingleAddressRanges(allowed, AddressFamily.InterNetwork)),
            MaxV4);
        var blockedV6 = Complement(
            LocalNetworkV6.Concat(SingleAddressRanges(allowed, AddressFamily.InterNetworkV6)),
            MaxV6);

        var blocked = blockedV4
            .Select(range => Format(range, AddressFamily.InterNetwork))
            .Concat(blockedV6.Select(range => Format(range, AddressFamily.InterNetworkV6)));

        return new InternetBlockRules(
            string.Join(",", blocked),
            resolvers.Length == 0
                ? null
                : string.Join(",", resolvers.Select(address => address.ToString())));
    }

    public static bool IsLocalNetwork(IPAddress address)
    {
        address = Normalize(address);
        var number = ToNumber(address);
        var ranges = address.AddressFamily == AddressFamily.InterNetwork ? LocalNetworkV4 : LocalNetworkV6;
        return ranges.Any(range => number >= range.Start && number <= range.End);
    }

    private static IEnumerable<IPAddress> Distinct(IEnumerable<IPAddress> addresses)
    {
        return addresses
            .Select(Normalize)
            .Where(address => address.AddressFamily is AddressFamily.InterNetwork or AddressFamily.InterNetworkV6)
            .DistinctBy(address => (address.AddressFamily, ToNumber(address)));
    }

    private static IPAddress Normalize(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6)
        {
            return address.MapToIPv4();
        }

        // Scope IDs (fe80::1%12) are per-interface and mean nothing to the firewall.
        return address.AddressFamily == AddressFamily.InterNetworkV6 && address.ScopeId != 0
            ? new IPAddress(address.GetAddressBytes())
            : address;
    }

    private static IEnumerable<AddressRange> SingleAddressRanges(IEnumerable<IPAddress> addresses, AddressFamily family)
    {
        return addresses
            .Where(address => address.AddressFamily == family)
            .Select(address =>
            {
                var number = ToNumber(address);
                return new AddressRange(number, number);
            });
    }

    private static List<AddressRange> Complement(IEnumerable<AddressRange> allowed, UInt128 max)
    {
        var blocked = new List<AddressRange>();
        var cursor = UInt128.Zero;

        foreach (var range in allowed.OrderBy(range => range.Start))
        {
            if (range.End < cursor)
            {
                continue;
            }

            if (range.Start > cursor)
            {
                blocked.Add(new AddressRange(cursor, range.Start - 1));
            }

            if (range.End == max)
            {
                return blocked;
            }

            cursor = range.End + 1;
        }

        blocked.Add(new AddressRange(cursor, max));
        return blocked;
    }

    private static string Format(AddressRange range, AddressFamily family)
    {
        var start = FromNumber(range.Start, family).ToString();
        return range.Start == range.End
            ? start
            : $"{start}-{FromNumber(range.End, family)}";
    }

    private static AddressRange Cidr(string cidr)
    {
        var slash = cidr.IndexOf('/');
        var address = IPAddress.Parse(cidr[..slash]);
        var prefix = int.Parse(cidr[(slash + 1)..]);
        var bits = address.AddressFamily == AddressFamily.InterNetwork ? 32 : 128;
        var hostBits = bits - prefix;

        if (hostBits == 128)
        {
            return new AddressRange(UInt128.Zero, UInt128.MaxValue);
        }

        var hostMask = (UInt128.One << hostBits) - 1;
        var start = ToNumber(address) & ~hostMask;
        return new AddressRange(start, start | hostMask);
    }

    private static UInt128 ToNumber(IPAddress address)
    {
        var value = UInt128.Zero;
        foreach (var part in address.GetAddressBytes())
        {
            value = (value << 8) | part;
        }

        return value;
    }

    private static IPAddress FromNumber(UInt128 value, AddressFamily family)
    {
        var bytes = new byte[family == AddressFamily.InterNetwork ? 4 : 16];
        for (var index = bytes.Length - 1; index >= 0; index--)
        {
            bytes[index] = (byte)(value & 0xFF);
            value >>= 8;
        }

        return new IPAddress(bytes);
    }

    private readonly record struct AddressRange(UInt128 Start, UInt128 End);
}

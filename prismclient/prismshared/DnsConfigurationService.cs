using System.Management;

namespace prismshared;

public interface IDnsAdapterConfig
{
    string Description { get; }

    uint SetDnsServerSearchOrder(string[]? dnsServers);
}

public sealed record DnsAdapterApplyResult(
    string AdapterDescription,
    uint ReturnCode,
    bool Succeeded);

public sealed record DnsConfigurationApplyResult(
    bool Succeeded,
    IReadOnlyList<DnsAdapterApplyResult> AdapterResults,
    string? Error);

public sealed class DnsConfigurationService
{
    private readonly Func<IReadOnlyList<IDnsAdapterConfig>> getAdapters;

    public DnsConfigurationService(Func<IReadOnlyList<IDnsAdapterConfig>>? getAdapters = null)
    {
        this.getAdapters = getAdapters ?? GetActiveIpv4Adapters;
    }

    public DnsConfigurationApplyResult Apply(string primaryIp, string? secondaryIp)
    {
        if (string.IsNullOrWhiteSpace(primaryIp))
        {
            throw new InvalidOperationException("A primary DNS server is required.");
        }

        var servers = string.IsNullOrWhiteSpace(secondaryIp)
            ? [primaryIp.Trim()]
            : new[] { primaryIp.Trim(), secondaryIp.Trim() };

        return ApplyServers(servers);
    }

    public DnsConfigurationApplyResult ResetToDhcp()
    {
        return ApplyServers(null);
    }

    internal DnsConfigurationApplyResult ApplyServers(string[]? dnsServers)
    {
        var adapters = getAdapters();
        if (adapters.Count == 0)
        {
            return new DnsConfigurationApplyResult(
                false,
                [],
                "No active DHCP-enabled IPv4 network adapters were found.");
        }

        var results = adapters
            .Select(adapter =>
            {
                var returnCode = adapter.SetDnsServerSearchOrder(dnsServers);
                return new DnsAdapterApplyResult(
                    adapter.Description,
                    returnCode,
                    returnCode is 0 or 1);
            })
            .ToArray();

        var failures = results.Where(result => !result.Succeeded).ToArray();
        if (failures.Length == 0)
        {
            return new DnsConfigurationApplyResult(true, results, null);
        }

        var error = "DNS update failed for "
            + string.Join(
                ", ",
                failures.Select(failure => $"{failure.AdapterDescription} (WMI return code {failure.ReturnCode})"))
            + ".";

        return new DnsConfigurationApplyResult(false, results, error);
    }

    private static IReadOnlyList<IDnsAdapterConfig> GetActiveIpv4Adapters()
    {
        using var searcher = new ManagementObjectSearcher(
            "SELECT * FROM Win32_NetworkAdapterConfiguration WHERE IPEnabled = TRUE AND DHCPEnabled = TRUE");

        return searcher
            .Get()
            .Cast<ManagementObject>()
            .Select(adapter => new WmiDnsAdapterConfig(adapter))
            .ToArray();
    }

    private sealed class WmiDnsAdapterConfig : IDnsAdapterConfig
    {
        private readonly ManagementObject adapter;

        public WmiDnsAdapterConfig(ManagementObject adapter)
        {
            this.adapter = adapter;
        }

        public string Description => adapter["Description"]?.ToString() ?? "Unknown adapter";

        public uint SetDnsServerSearchOrder(string[]? dnsServers)
        {
            using var parameters = adapter.GetMethodParameters("SetDNSServerSearchOrder");
            parameters["DNSServerSearchOrder"] = dnsServers;

            using var result = adapter.InvokeMethod("SetDNSServerSearchOrder", parameters, null);
            return Convert.ToUInt32(result?["ReturnValue"] ?? 1);
        }
    }
}

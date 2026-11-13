using System.Net;
using System.Net.NetworkInformation;

namespace prismshared;

internal sealed record InternetBlockResult(bool Succeeded, string? Error = null)
{
    public static InternetBlockResult Ok { get; } = new(true);
}

/// <summary>
/// Whether No internet is on. <see cref="ServerAddresses"/> holds the FamilyPrism server addresses
/// seen most recently, newest first, so the server stays reachable when a lookup fails.
/// </summary>
internal sealed record InternetBlockPersistedState(
    bool Enabled,
    string[]? ServerAddresses = null);

internal interface IResolverAddressSource
{
    IReadOnlyList<IPAddress> GetDnsServers();

    IReadOnlyList<IPAddress> GetDhcpServers();
}

internal sealed class NetworkInterfaceResolverAddressSource : IResolverAddressSource
{
    public IReadOnlyList<IPAddress> GetDnsServers()
    {
        return ActiveInterfaces().SelectMany(properties => properties.DnsAddresses).ToArray();
    }

    public IReadOnlyList<IPAddress> GetDhcpServers()
    {
        return ActiveInterfaces().SelectMany(properties => properties.DhcpServerAddresses).ToArray();
    }

    private static IEnumerable<IPInterfaceProperties> ActiveInterfaces()
    {
        return NetworkInterface.GetAllNetworkInterfaces()
            .Where(adapter => adapter.OperationalStatus == OperationalStatus.Up
                && adapter.NetworkInterfaceType != NetworkInterfaceType.Loopback)
            .Select(adapter => adapter.GetIPProperties());
    }
}

/// <summary>
/// Turns No internet on and off with Windows Firewall rules. DNS is left alone, so the Service can
/// keep looking up the FamilyPrism server; the rules are refreshed when its addresses change
/// (Railway does not promise a fixed address).
/// </summary>
internal sealed class InternetBlockService
{
    internal const int MaxRememberedServerAddresses = 8;

    private readonly IInternetBlockFirewall firewall;
    private readonly IResolverAddressSource resolverAddresses;
    private readonly Func<string, CancellationToken, Task<IPAddress[]>> resolveHost;
    private readonly Func<string?> serverBaseUrl;
    private readonly Action<string, Exception?>? logError;
    private readonly string? statePath;
    private InternetBlockRules? appliedRules;

    public InternetBlockService(
        IInternetBlockFirewall? firewall = null,
        IResolverAddressSource? resolverAddresses = null,
        Func<string, CancellationToken, Task<IPAddress[]>>? resolveHost = null,
        Func<string?>? serverBaseUrl = null,
        Action<string, Exception?>? logError = null,
        string? statePath = null)
    {
        this.firewall = firewall ?? new WindowsInternetBlockFirewall();
        this.resolverAddresses = resolverAddresses ?? new NetworkInterfaceResolverAddressSource();
        this.resolveHost = resolveHost ?? ((host, ct) => Dns.GetHostAddressesAsync(host, ct));
        this.serverBaseUrl = serverBaseUrl ?? ConfiguredServerBaseUrl;
        this.logError = logError;
        this.statePath = statePath;
    }

    public bool IsEnabled => ReadState()?.Enabled == true;

    /// <summary>
    /// Turns No internet on. If the rules cannot be written, No internet stays off so the PC
    /// matches the failure reported to the server.
    /// </summary>
    public async Task<InternetBlockResult> EnableAsync(CancellationToken cancellationToken)
    {
        var previous = ReadState();
        var state = (previous ?? new InternetBlockPersistedState(false)) with { Enabled = true };
        WriteState(state);

        var result = await ApplyAsync(state, force: true, cancellationToken);
        if (!result.Succeeded && previous?.Enabled != true)
        {
            WriteState(state with { Enabled = false });
        }

        return result;
    }

    public InternetBlockResult Disable()
    {
        try
        {
            firewall.Remove();
        }
        catch (Exception ex)
        {
            return new InternetBlockResult(false, $"The No internet firewall rules could not be removed. {ex.Message}");
        }

        appliedRules = null;
        var state = ReadState();
        if (state?.Enabled == true)
        {
            WriteState(state with { Enabled = false });
        }

        return InternetBlockResult.Ok;
    }

    /// <summary>
    /// Re-resolves the server and DNS servers and rewrites the rules if they changed. Does nothing
    /// while No internet is off.
    /// </summary>
    public async Task<InternetBlockResult> RefreshAsync(CancellationToken cancellationToken)
    {
        var state = ReadState();
        return state?.Enabled == true
            ? await ApplyAsync(state, force: false, cancellationToken)
            : InternetBlockResult.Ok;
    }

    /// <summary>
    /// Makes the firewall match the saved state at Service start: rules are rewritten when No
    /// internet is on (someone may have deleted them) and removed when it is off.
    /// </summary>
    public async Task<InternetBlockResult> ReconcileAsync(CancellationToken cancellationToken)
    {
        var state = ReadState();
        return state?.Enabled == true
            ? await ApplyAsync(state, force: true, cancellationToken)
            : Disable();
    }

    private async Task<InternetBlockResult> ApplyAsync(
        InternetBlockPersistedState state,
        bool force,
        CancellationToken cancellationToken)
    {
        var resolved = await ResolveServerAsync(cancellationToken);
        var remembered = ParseAddresses(state.ServerAddresses);
        var serverAddresses = resolved
            .Concat(remembered)
            .DistinctBy(address => address.ToString())
            .Take(MaxRememberedServerAddresses)
            .ToArray();

        var serverAddressText = serverAddresses.Select(address => address.ToString()).ToArray();
        if (!serverAddressText.SequenceEqual(state.ServerAddresses ?? []))
        {
            WriteState(state with { ServerAddresses = serverAddressText });
        }

        InternetBlockRules rules;
        try
        {
            rules = InternetBlockAddressPlanner.Plan(
                serverAddresses,
                resolverAddresses.GetDnsServers(),
                resolverAddresses.GetDhcpServers());
        }
        catch (NetworkInformationException ex)
        {
            return new InternetBlockResult(false, $"The network settings could not be read. {ex.Message}");
        }

        if (!force && rules == appliedRules)
        {
            return InternetBlockResult.Ok;
        }

        try
        {
            firewall.Apply(rules);
        }
        catch (Exception ex)
        {
            appliedRules = null;
            return new InternetBlockResult(false, $"The No internet firewall rules could not be written. {ex.Message}");
        }

        appliedRules = rules;
        return InternetBlockResult.Ok;
    }

    private async Task<IPAddress[]> ResolveServerAsync(CancellationToken cancellationToken)
    {
        var baseUrl = serverBaseUrl();
        if (string.IsNullOrWhiteSpace(baseUrl) || !Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri))
        {
            return [];
        }

        if (IPAddress.TryParse(uri.IdnHost, out var literal))
        {
            return [literal];
        }

        try
        {
            return await resolveHost(uri.IdnHost, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            // Offline or DNS hiccup: the remembered addresses keep the server reachable.
            logError?.Invoke("The Family Prism server address could not be looked up for No internet.", ex);
            return [];
        }
    }

    private static IEnumerable<IPAddress> ParseAddresses(string[]? addresses)
    {
        foreach (var text in addresses ?? [])
        {
            if (IPAddress.TryParse(text, out var address))
            {
                yield return address;
            }
        }
    }

    private InternetBlockPersistedState? ReadState()
    {
        return AtomicJsonFileStore.Read<InternetBlockPersistedState>(statePath ?? PrismPaths.InternetBlockPath);
    }

    private void WriteState(InternetBlockPersistedState state)
    {
        AtomicJsonFileStore.Write(statePath ?? PrismPaths.InternetBlockPath, state);
    }

    private static string? ConfiguredServerBaseUrl()
    {
        try
        {
            return MachineConfigurationStore.HasSecureConfiguration()
                ? MachineConfigurationStore.Load().ServerBaseUrl
                : null;
        }
        catch (Exception)
        {
            return null;
        }
    }
}

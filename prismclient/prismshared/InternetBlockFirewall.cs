using System.Runtime.InteropServices;

namespace prismshared;

internal interface IInternetBlockFirewall
{
    /// <summary>Creates or updates the No internet rules so they match <paramref name="rules"/>.</summary>
    void Apply(InternetBlockRules rules);

    /// <summary>Removes every No internet rule. Removing rules that are not there is not an error.</summary>
    void Remove();
}

/// <summary>
/// Outbound block rules in Windows Defender Firewall. Block rules win over allow rules, so another
/// app's allow rule cannot open a path around them. They persist across reboots, and only a
/// Windows administrator can change them.
/// </summary>
internal sealed class WindowsInternetBlockFirewall : IInternetBlockFirewall
{
    // The uninstaller deletes these rules by name (installer/FamilyPrism.iss). Keep them in sync.
    internal const string BlockRuleName = "Family Prism No Internet";
    internal const string ResolverTcpRuleName = "Family Prism No Internet (DNS servers, TCP)";
    internal const string ResolverUdpRuleName = "Family Prism No Internet (DNS servers, UDP)";

    private const string RuleGroup = "Family Prism";
    private const string AllPortsExceptDns = "1-52,54-65535";
    private const int ProtocolAny = 256;
    private const int ProtocolTcp = 6;
    private const int ProtocolUdp = 17;
    private const int DirectionOutbound = 2;
    private const int ActionBlock = 0;
    private const int AllProfiles = 0x7FFFFFFF;
    private const int MaxDuplicateRemovals = 16;

    public void Apply(InternetBlockRules rules)
    {
        object policy = CreatePolicy();

        Upsert(
            policy,
            BlockRuleName,
            ProtocolAny,
            rules.BlockedRemoteAddresses,
            remotePorts: null,
            "Blocks internet access while the No internet profile is on. The local network and the Family Prism server stay reachable.");

        if (rules.ResolverAddresses is null)
        {
            RemoveRule(policy, ResolverTcpRuleName);
            RemoveRule(policy, ResolverUdpRuleName);
            return;
        }

        const string resolverDescription =
            "While the No internet profile is on, DNS servers outside the local network are reachable for DNS only.";
        Upsert(policy, ResolverTcpRuleName, ProtocolTcp, rules.ResolverAddresses, AllPortsExceptDns, resolverDescription);
        Upsert(policy, ResolverUdpRuleName, ProtocolUdp, rules.ResolverAddresses, AllPortsExceptDns, resolverDescription);
    }

    public void Remove()
    {
        object policy = CreatePolicy();
        RemoveRule(policy, BlockRuleName);
        RemoveRule(policy, ResolverTcpRuleName);
        RemoveRule(policy, ResolverUdpRuleName);
    }

    private static object CreatePolicy()
    {
        var policyType = Type.GetTypeFromProgID("HNetCfg.FwPolicy2", throwOnError: true)!;
        return Activator.CreateInstance(policyType)!;
    }

    private static void Upsert(
        object policyObject,
        string name,
        int protocol,
        string remoteAddresses,
        string? remotePorts,
        string description)
    {
        dynamic policy = policyObject;
        dynamic? existing = FindRule(policyObject, name);
        if (existing is not null && (int)existing.Protocol != protocol)
        {
            RemoveRule(policyObject, name);
            existing = null;
        }

        if (existing is not null)
        {
            existing.RemoteAddresses = remoteAddresses;
            if (remotePorts is not null)
            {
                existing.RemotePorts = remotePorts;
            }

            existing.Direction = DirectionOutbound;
            existing.Action = ActionBlock;
            existing.Profiles = AllProfiles;
            existing.Enabled = true;
            return;
        }

        var ruleType = Type.GetTypeFromProgID("HNetCfg.FWRule", throwOnError: true)!;
        dynamic rule = Activator.CreateInstance(ruleType)!;
        rule.Name = name;
        rule.Description = description;
        rule.Grouping = RuleGroup;
        rule.Protocol = protocol;
        rule.RemoteAddresses = remoteAddresses;
        if (remotePorts is not null)
        {
            rule.RemotePorts = remotePorts;
        }

        rule.Direction = DirectionOutbound;
        rule.Action = ActionBlock;
        rule.Profiles = AllProfiles;
        rule.InterfaceTypes = "All";
        rule.Enabled = true;
        policy.Rules.Add(rule);
    }

    private static object? FindRule(object policyObject, string name)
    {
        dynamic policy = policyObject;
        try
        {
            return (object)policy.Rules.Item(name);
        }
        catch (Exception ex) when (ex is COMException or FileNotFoundException)
        {
            return null;
        }
    }

    private static void RemoveRule(object policyObject, string name)
    {
        dynamic policy = policyObject;
        // Rules.Remove deletes one rule per call, and names are not unique in Windows Firewall.
        for (var attempt = 0; attempt < MaxDuplicateRemovals && FindRule(policyObject, name) is not null; attempt++)
        {
            policy.Rules.Remove(name);
        }
    }
}

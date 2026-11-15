using System.Text;

namespace prismbridge;

/// <summary>The router's MAC filter as one session read it.</summary>
public sealed record RouterTable(IReadOnlyList<RouterEntry> Entries, int MaxRules, string? HostMac);

/// <summary>Delete the entry at <see cref="Index"/>, which must still hold <see cref="Mac"/>.</summary>
public sealed record PlannedDelete(int Index, string Mac);

public sealed record PlannedAdd(string DeviceId, string Name, string Mac);

/// <summary>Deletes run first, highest position first, so earlier positions never shift; adds follow.</summary>
public sealed record ReconcilePlan(
    IReadOnlyList<PlannedDelete> Deletes,
    IReadOnlyList<PlannedAdd> Adds,
    IReadOnlyList<DeviceFailure> Failures)
{
    public bool HasChanges => Deletes.Count > 0 || Adds.Count > 0;
}

public static class ReconcilePlanner
{
    /// <summary>
    /// Makes every managed MAC address present when its device is blocked and absent when it is
    /// allowed. Entries for MAC addresses the desired state doesn't name are never touched.
    /// </summary>
    public static ReconcilePlan Plan(
        DesiredState state,
        RouterTable table,
        DateTimeOffset localNow,
        IReadOnlySet<string> protectedMacs)
    {
        var serverNow = state.ServerNow(localNow);
        var accessByMac = new Dictionary<string, (DesiredDevice Device, DeviceAccess Access)>(StringComparer.OrdinalIgnoreCase);
        foreach (var device in state.Devices)
        {
            var access = device.AccessAt(serverNow);
            foreach (var mac in device.Macs)
            {
                accessByMac.TryAdd(mac, (device, access));
            }
        }

        var deletes = new List<PlannedDelete>();
        var present = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < table.Entries.Count; index++)
        {
            var mac = MacAddress.Normalize(table.Entries[index].Mac);
            if (mac is null || !accessByMac.TryGetValue(mac, out var desired))
            {
                continue;
            }

            if (desired.Access == DeviceAccess.Allowed)
            {
                deletes.Add(new PlannedDelete(index, table.Entries[index].Mac));
            }
            else
            {
                present.Add(mac);
            }
        }

        deletes.Reverse();

        var protectedSet = new HashSet<string>(
            protectedMacs.Select(MacAddress.Normalize).OfType<string>(),
            StringComparer.OrdinalIgnoreCase);
        if (MacAddress.Normalize(table.HostMac) is { } hostMac)
        {
            protectedSet.Add(hostMac);
        }

        var failures = new List<DeviceFailure>();
        var adds = new List<PlannedAdd>();
        var room = table.MaxRules - (table.Entries.Count - deletes.Count);
        foreach (var device in state.Devices)
        {
            if (device.AccessAt(serverNow) != DeviceAccess.Blocked)
            {
                continue;
            }

            foreach (var mac in device.Macs.Where(mac => !present.Contains(mac)))
            {
                if (protectedSet.Contains(mac))
                {
                    AddFailure(failures, device.Id, DeviceFailureCode.ProtectedMac);
                }
                else if (room <= 0)
                {
                    AddFailure(failures, device.Id, DeviceFailureCode.TableFull);
                }
                else
                {
                    adds.Add(new PlannedAdd(device.Id, RouterName.From(device.Name), mac));
                    room--;
                }
            }
        }

        return new ReconcilePlan(deletes, adds, failures);
    }

    private static void AddFailure(List<DeviceFailure> failures, string deviceId, DeviceFailureCode code)
    {
        if (!failures.Any(failure => failure.DeviceId == deviceId && failure.Code == code))
        {
            failures.Add(new DeviceFailure(deviceId, code));
        }
    }
}

public static class RouterName
{
    public const int MaxLength = 50;

    /// <summary>The router accepts only letters, digits, and underscores, up to 50 characters.</summary>
    public static string From(string deviceName)
    {
        var builder = new StringBuilder();
        foreach (var character in deviceName.Trim())
        {
            var safe = char.IsAsciiLetterOrDigit(character) ? character : '_';
            if (safe == '_' && builder.Length > 0 && builder[^1] == '_')
            {
                continue;
            }

            builder.Append(safe);
        }

        var name = builder.ToString().Trim('_');
        if (name.Length > MaxLength)
        {
            name = name[..MaxLength].TrimEnd('_');
        }

        return name.Length == 0 ? "FamilyPrism_device" : name;
    }
}

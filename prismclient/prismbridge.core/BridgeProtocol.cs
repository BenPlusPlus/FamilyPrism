using System.Text.Json;
using System.Text.Json.Serialization;

namespace prismbridge;

/// <summary>Whether a Network device is blocked or allowed at the router (ADR 0008).</summary>
public enum DeviceAccess
{
    Blocked,
    Allowed
}

public sealed record TimedAccess(DeviceAccess Access, DateTimeOffset ExpiresAt);

public sealed record DesiredDevice(
    string Id,
    string Name,
    IReadOnlyList<string> Macs,
    DeviceAccess Standing,
    TimedAccess? Timed)
{
    /// <summary>A running timed change wins until its deadline; then standing access returns.</summary>
    public DeviceAccess AccessAt(DateTimeOffset serverNow) =>
        Timed is not null && Timed.ExpiresAt > serverNow ? Timed.Access : Standing;
}

/// <summary>
/// The server's complete desired state, as last received. <see cref="ClockOffset"/> is server time
/// minus this PC's time when it arrived, so deadlines are judged on the server's clock.
/// </summary>
public sealed record DesiredState(
    IReadOnlyList<DesiredDevice> Devices,
    TimeSpan ClockOffset,
    DateTimeOffset ReceivedAtUtc)
{
    public static DesiredState Empty { get; } = new([], TimeSpan.Zero, DateTimeOffset.MinValue);

    public DateTimeOffset ServerNow(DateTimeOffset localNow) => localNow + ClockOffset;

    /// <summary>The next time a timed change ends, in this PC's time, or null if none is running.</summary>
    public DateTimeOffset? NextDeadline(DateTimeOffset localNow)
    {
        var serverNow = ServerNow(localNow);
        var next = Devices
            .Where(device => device.Timed is not null && device.Timed.ExpiresAt > serverNow)
            .Select(device => device.Timed!.ExpiresAt)
            .DefaultIfEmpty(DateTimeOffset.MaxValue)
            .Min();

        return next == DateTimeOffset.MaxValue ? null : next - ClockOffset;
    }
}

public static class MacAddress
{
    /// <summary>Returns <c>AA-BB-CC-DD-EE-FF</c>, or null if <paramref name="value"/> isn't a MAC address.</summary>
    public static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var hex = new string(value.Where(Uri.IsHexDigit).ToArray());
        var separators = value.Count(character => character is ':' or '-' or '.' or ' ');
        if (hex.Length != 12 || hex.Length + separators != value.Trim().Length)
        {
            return null;
        }

        return string.Join('-', Enumerable.Range(0, 6).Select(index => hex.Substring(index * 2, 2))).ToUpperInvariant();
    }
}

public enum BridgeFailureCode
{
    Unreachable,
    LoginFailed,
    LockedOut,
    RouterBusy,
    Unexpected
}

public enum DeviceFailureCode
{
    ProtectedMac,
    TableFull,
    Unexpected
}

public sealed record RouterEntry(string Name, string Mac);

public sealed record DeviceFailure(string DeviceId, DeviceFailureCode Code, string? Message = null);

public sealed record BridgeFailure(BridgeFailureCode Code, string? Message = null);

/// <summary>The result of one pass. <see cref="Entries"/> is the router's whole table, or null when it couldn't be read.</summary>
public sealed record ReconcileReport(
    IReadOnlyList<RouterEntry>? Entries,
    IReadOnlyList<DeviceFailure> DeviceErrors,
    BridgeFailure? Error)
{
    public static ReconcileReport Failed(BridgeFailure error) => new(null, [], error);
}

public abstract record ServerMessage
{
    public sealed record Connected(string BridgeId, string Name) : ServerMessage;

    public sealed record Desired(DesiredState State) : ServerMessage;

    public sealed record ReconcileNow : ServerMessage;
}

/// <summary>JSON for the messages in docs/router-bridge.md.</summary>
public static class BridgeProtocol
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.KebabCaseLower) },
        DefaultIgnoreCondition = JsonIgnoreCondition.Never
    };

    public static ServerMessage? Parse(string json, DateTimeOffset localNow)
    {
        try
        {
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("type", out var type))
            {
                return null;
            }

            switch (type.GetString())
            {
                case "connected":
                    return new ServerMessage.Connected(
                        root.GetProperty("bridgeId").GetString() ?? string.Empty,
                        root.GetProperty("name").GetString() ?? string.Empty);
                case "reconcile-now":
                    return new ServerMessage.ReconcileNow();
                case "desired-state":
                    // A malformed device rejects the whole message: applying the rest could drop devices from management.
                    var payload = root.Deserialize<DesiredStatePayload>(JsonOptions);
                    return payload?.Devices is null || payload.Devices.Any(device => device is null || device.Id is null || device.Name is null || device.Macs is null)
                        ? null
                        : new ServerMessage.Desired(ToState(payload, localNow));
                default:
                    return null;
            }
        }
        catch (Exception exception) when (exception is JsonException or KeyNotFoundException or InvalidOperationException)
        {
            return null;
        }
    }

    public static string Identify(string version, string routerModel) =>
        JsonSerializer.Serialize(new { type = "identify", version, routerModel }, JsonOptions);

    public static string Report(ReconcileReport report) =>
        JsonSerializer.Serialize(
            new
            {
                type = "reconcile-report",
                entries = report.Entries?.Select(entry => new { name = entry.Name, mac = entry.Mac }),
                deviceErrors = report.DeviceErrors.Select(error => new
                {
                    deviceId = error.DeviceId,
                    code = error.Code,
                    message = error.Message
                }),
                error = report.Error is null ? null : new { code = report.Error.Code, message = report.Error.Message }
            },
            JsonOptions);

    public static string Serialize(DesiredState state) => JsonSerializer.Serialize(state, JsonOptions);

    public static DesiredState? Deserialize(string json) => JsonSerializer.Deserialize<DesiredState>(json, JsonOptions);

    private static DesiredState ToState(DesiredStatePayload payload, DateTimeOffset localNow)
    {
        var devices = payload.Devices!
            .Select(device => new DesiredDevice(
                device.Id,
                device.Name,
                device.Macs.Select(MacAddress.Normalize).OfType<string>().Distinct().ToList(),
                device.Standing,
                device.Timed))
            .ToList();

        return new DesiredState(devices, payload.ServerTime - localNow, localNow);
    }

    private sealed record DesiredStatePayload(List<DesiredDevicePayload>? Devices, DateTimeOffset ServerTime);

    private sealed record DesiredDevicePayload(
        string Id,
        string Name,
        List<string> Macs,
        DeviceAccess Standing,
        TimedAccess? Timed);
}

using System.Security.Cryptography;
using System.Text;
using prismshared;

namespace prismbridge;

public static class BridgeConstants
{
    public const string ServiceName = "prismbridge";
    public const string ServiceDisplayName = "Family Prism Router Bridge";
    public const string ServiceDescription = "Blocks and allows Family Prism Network devices at the home router.";
}

/// <summary>Under the same storage root as the Client, in its own folder.</summary>
public static class BridgePaths
{
    public static string Root => Path.Combine(PrismPaths.StorageRoot, "Bridge");

    /// <summary>SYSTEM and Administrators only (in Release builds).</summary>
    public static string ConfigDirectory => Path.Combine(Root, "Config");

    public static string ConfigPath => Path.Combine(ConfigDirectory, "bridge-config.json");

    public static string DesiredStatePath => Path.Combine(ConfigDirectory, "desired-state.json");

    public static string LoginBlockPath => Path.Combine(ConfigDirectory, "login-block.json");

    public static void EnsureConfigDirectory()
    {
        Directory.CreateDirectory(Root);
        PrismAcl.ApplySystemAndAdministratorsOnly(Directory.CreateDirectory(ConfigDirectory));
    }
}

public sealed record BridgeConfiguration(
    string ServerBaseUrl,
    string BridgeId,
    string BridgeName,
    string Credential,
    string WebsocketPath,
    string RouterAddress,
    string RouterUsername,
    string RouterPassword)
{
    public Uri RouterBaseUri => new(RouterAddress.Contains("://") ? RouterAddress : $"http://{RouterAddress}");

    public Uri WebsocketUri
    {
        get
        {
            var endpoint = new Uri(new Uri(ServerBaseUrl), WebsocketPath);
            return new UriBuilder(endpoint) { Scheme = endpoint.Scheme == Uri.UriSchemeHttps ? "wss" : "ws" }.Uri;
        }
    }
}

internal sealed record StoredBridgeConfiguration(
    string ServerBaseUrl,
    string BridgeId,
    string BridgeName,
    string ProtectedCredential,
    string WebsocketPath,
    string RouterAddress,
    string RouterUsername,
    string ProtectedRouterPassword);

/// <summary>The bridge's server credential and the router password, protected with DPAPI.</summary>
public static class BridgeConfigurationStore
{
    public static bool Exists() => File.Exists(BridgePaths.ConfigPath);

    public static BridgeConfiguration Load()
    {
        var stored = AtomicJsonFileStore.Read<StoredBridgeConfiguration>(BridgePaths.ConfigPath)
            ?? throw new InvalidOperationException("The Router bridge isn't set up. Run 'prismbridge setup'.");

        return new BridgeConfiguration(
            stored.ServerBaseUrl,
            stored.BridgeId,
            stored.BridgeName,
            Unprotect(stored.ProtectedCredential),
            stored.WebsocketPath,
            stored.RouterAddress,
            stored.RouterUsername,
            Unprotect(stored.ProtectedRouterPassword));
    }

    public static void Save(BridgeConfiguration configuration)
    {
        BridgePaths.EnsureConfigDirectory();
        AtomicJsonFileStore.Write(
            BridgePaths.ConfigPath,
            new StoredBridgeConfiguration(
                configuration.ServerBaseUrl,
                configuration.BridgeId,
                configuration.BridgeName,
                Protect(configuration.Credential),
                configuration.WebsocketPath,
                configuration.RouterAddress,
                configuration.RouterUsername,
                Protect(configuration.RouterPassword)));
    }

    private static string Protect(string value) =>
        Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(value), Entropy, Scope));

    private static string Unprotect(string value) =>
        Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(value), Entropy, Scope));

    private static byte[] Entropy => Encoding.UTF8.GetBytes($"{PrismConstants.ApplicationName}:{BridgeConstants.ServiceName}");

    private static DataProtectionScope Scope =>
        PrismBuildMode.UsesMachineScope ? DataProtectionScope.LocalMachine : DataProtectionScope.CurrentUser;
}

/// <summary>The last desired state, so the bridge keeps enforcing it (and ends timed changes) while offline.</summary>
public sealed class DesiredStateStore(string path)
{
    public static DesiredStateStore Default => new(BridgePaths.DesiredStatePath);

    public DesiredState Load()
    {
        try
        {
            return File.Exists(path) ? BridgeProtocol.Deserialize(File.ReadAllText(path)) ?? DesiredState.Empty : DesiredState.Empty;
        }
        catch (Exception exception) when (exception is IOException or System.Text.Json.JsonException)
        {
            return DesiredState.Empty;
        }
    }

    public void Save(DesiredState state)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var temp = $"{path}.{Guid.NewGuid():N}.tmp";
        File.WriteAllText(temp, BridgeProtocol.Serialize(state));
        File.Move(temp, path, overwrite: true);
    }
}

/// <summary>Persists the login block across restarts; saving new router credentials clears it.</summary>
public sealed class FileLoginBlockStore(string path) : ILoginBlockStore
{
    public static FileLoginBlockStore Default => new(BridgePaths.LoginBlockPath);

    public BridgeFailure? Current
    {
        get
        {
            try
            {
                return AtomicJsonFileStore.Read<BridgeFailure>(path);
            }
            catch (Exception exception) when (exception is IOException or System.Text.Json.JsonException)
            {
                return null;
            }
        }
    }

    public void Block(BridgeFailure failure) => AtomicJsonFileStore.Write(path, failure);

    public void Clear()
    {
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }
}

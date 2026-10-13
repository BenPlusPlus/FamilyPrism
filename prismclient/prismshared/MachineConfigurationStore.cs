using System.Security.Cryptography;
using System.Text;

namespace prismshared;

public static class MachineConfigurationStore
{
    public static bool HasSecureConfiguration() => File.Exists(PrismPaths.SecureConfigPath);

    public static PrismConfiguration Load()
    {
        var stored = AtomicJsonFileStore.Read<PrismStoredConfiguration>(PrismPaths.SecureConfigPath)
            ?? throw new InvalidOperationException("The Family Prism agent configuration could not be loaded.");

        var protectedBytes = Convert.FromBase64String(stored.ProtectedCredential);
        var credentialBytes = ProtectedData.Unprotect(
            protectedBytes,
            GetEntropy(),
            GetDataProtectionScope());

        return new PrismConfiguration(
            stored.ServerBaseUrl,
            stored.ClientId,
            stored.ClientName,
            Encoding.UTF8.GetString(credentialBytes),
            stored.WebsocketPath);
    }

    public static void Save(PendingSetupPayload payload)
    {
        EnsureSecureDirectories();
        EnsureStateDirectory();

        var protectedBytes = ProtectedData.Protect(
            Encoding.UTF8.GetBytes(payload.Credential),
            GetEntropy(),
            GetDataProtectionScope());

        var stored = new PrismStoredConfiguration(
            payload.ServerBaseUrl,
            payload.ClientId,
            payload.ClientName,
            Convert.ToBase64String(protectedBytes),
            payload.WebsocketPath);

        AtomicJsonFileStore.Write(PrismPaths.SecureConfigPath, stored);
    }

    public static void EnsureStateDirectory()
    {
        var directory = Directory.CreateDirectory(PrismPaths.StateDirectory);
        if (PrismBuildMode.UsesMachineScope)
        {
            directory.SetAccessControl(PrismAcl.CreateStateDirectorySecurity());
        }
    }

    private static void EnsureSecureDirectories()
    {
        Directory.CreateDirectory(PrismPaths.StorageRoot);
        var secureDirectory = Directory.CreateDirectory(PrismPaths.SecureConfigDirectory);
        PrismAcl.ApplySystemAndAdministratorsOnly(secureDirectory);
    }

    private static byte[] GetEntropy() => Encoding.UTF8.GetBytes($"{PrismConstants.ApplicationName}:{PrismConstants.ServiceName}");

    private static DataProtectionScope GetDataProtectionScope()
    {
        return PrismBuildMode.UsesMachineScope
            ? DataProtectionScope.LocalMachine
            : DataProtectionScope.CurrentUser;
    }
}

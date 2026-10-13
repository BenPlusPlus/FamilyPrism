namespace prismshared;

public static class PrismConstants
{
    public const string ApplicationName = "FamilyPrism";
    public const string ServiceName = "prismsvc";
    public const string ServiceDisplayName = "Family Prism Service";
    public const string AgentProcessName = "prismagent";
    public const string LogonTaskName = "Family Prism Agent";
    public const string UpdateHelperExecutableName = "prismupdate.exe";
}

public static class PrismBuildMode
{
#if DEBUG
    public static bool UsesMachineScope => false;

    public static string StorageScopeName => "Debug";
#else
    public static bool UsesMachineScope => true;

    public static string StorageScopeName => "Release";
#endif
}

public static class PrismPaths
{
    public static string UserProfileRoot => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        PrismConstants.ApplicationName,
        PrismBuildMode.StorageScopeName);

    public static string ProgramDataRoot => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        PrismConstants.ApplicationName);

    public static string StorageRoot => PrismBuildMode.UsesMachineScope
        ? ProgramDataRoot
        : UserProfileRoot;

    public static string SecureConfigDirectory => Path.Combine(StorageRoot, "Config");

    public static string StateDirectory => Path.Combine(StorageRoot, "State");

    public static string SecureConfigPath => Path.Combine(SecureConfigDirectory, "agent-config.json");

    public static string StatusPath => Path.Combine(StateDirectory, "agent-status.json");

    public static string PendingScreenshotRequestPath => Path.Combine(StateDirectory, "pending-screenshot-request.json");

    public static string PendingSetupDirectory => Path.Combine(UserProfileRoot, "PendingSetup");

    public static string InstalledRoot => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
        PrismConstants.ApplicationName);

    public static string InstalledServiceDirectory => Path.Combine(InstalledRoot, "Service");

    public static string InstalledServiceExecutablePath => Path.Combine(InstalledServiceDirectory, "prismsvc.exe");

    public static string BundledServiceDirectory => Path.Combine(AppContext.BaseDirectory, "service");

    public static string UpdatesDirectory => Path.Combine(StorageRoot, "Updates");
}

public sealed record PrismRegistrationResult(
    string ClientId,
    string ClientName,
    string Credential,
    string WebsocketPath);

public sealed record PendingSetupPayload(
    string ServerBaseUrl,
    string ClientId,
    string ClientName,
    string Credential,
    string WebsocketPath);

public sealed record PendingScreenshotRequestPayload(
    DateTimeOffset RequestedAtUtc);

public sealed record ApplyDnsCommand(
    string CommandId,
    bool ResetToDhcp,
    string? ProfileName,
    string? PrimaryIp,
    string? SecondaryIp);

public sealed record DnsDirectiveResult(
    string CommandId,
    string Status,
    string? Error = null);

public sealed record PrismStoredConfiguration(
    string ServerBaseUrl,
    string ClientId,
    string ClientName,
    string ProtectedCredential,
    string WebsocketPath);

public sealed record PrismConfiguration(
    string ServerBaseUrl,
    string ClientId,
    string ClientName,
    string Credential,
    string WebsocketPath);

public enum PrismConnectionState
{
    NotConfigured,
    Configured,
    Starting,
    Connecting,
    Connected,
    Disconnected,
    Error
}

public sealed record PrismStatusSnapshot
{
    public bool IsSetupComplete { get; init; }

    public string HostMode { get; init; } = "Tray";

    public PrismConnectionState ConnectionState { get; init; } = PrismConnectionState.NotConfigured;

    public string StatusMessage { get; init; } = "Waiting for setup.";

    public string? ServerBaseUrl { get; init; }

    public string? ClientId { get; init; }

    public string? ClientName { get; init; }

    public string? LastError { get; init; }

    public string? LastMessageId { get; init; }

    public string? LastMessageText { get; init; }

    public DateTimeOffset? LastConnectedAtUtc { get; init; }

    public DateTimeOffset? LastMessageReceivedAtUtc { get; init; }

    public DateTimeOffset UpdatedAtUtc { get; init; } = DateTimeOffset.UtcNow;
}

public sealed record PrismRegistrationErrorResponse(
    string? Error,
    string? Message);

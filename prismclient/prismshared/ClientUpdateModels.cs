namespace prismshared;

public sealed record ClientUpdatePackage(
    string Kind,
    int LayoutGeneration,
    string Sha256,
    string Url,
    string Version);

public sealed record ClientUpdateManifest(ClientUpdatePackage? Package);

public sealed record ClientUpdatePin(string Version, string Sha256);

public sealed record ClientUpdateEligibility(
    bool UsesMachineScope,
    bool IsWindowsServiceHost,
    bool BinariesAreInstalledLayout,
    bool IsConfigured,
    bool HasPendingSetup)
{
    public bool CanCheck =>
        UsesMachineScope
        && IsWindowsServiceHost
        && BinariesAreInstalledLayout
        && IsConfigured
        && !HasPendingSetup;

    public static ClientUpdateEligibility FromEnvironment(string hostMode, string? baseDirectory = null)
    {
        return new ClientUpdateEligibility(
            PrismBuildMode.UsesMachineScope,
            string.Equals(hostMode, "WindowsService", StringComparison.Ordinal),
            IsInstalledServiceLayout(baseDirectory),
            MachineConfigurationStore.HasSecureConfiguration(),
            PendingSetupStore.HasPendingSetup());
    }

    public static bool IsInstalledServiceLayout(string? baseDirectory = null)
    {
        var actual = Path.GetFullPath(baseDirectory ?? AppContext.BaseDirectory)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var expected = Path.GetFullPath(PrismPaths.InstalledServiceDirectory)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return actual.Equals(expected, StringComparison.OrdinalIgnoreCase);
    }
}

public enum ClientUpdateSkipReason
{
    NotEligible,
    Unconfigured,
    NoPackage,
    KindNotSupported,
    LayoutGenerationTooNew,
    VersionNotGreater,
    FailedPin,
    AlreadyInProgress
}

public abstract record ClientUpdateDecision
{
    public sealed record Apply(ClientUpdatePackage Package) : ClientUpdateDecision;

    public sealed record Skip(ClientUpdateSkipReason Reason) : ClientUpdateDecision;
}

public abstract record ClientUpdateStageResult
{
    public sealed record Ready : ClientUpdateStageResult;

    public sealed record HashMismatch : ClientUpdateStageResult;
}

public enum ClientUpdateOutcome
{
    Skipped,
    StagedAndRestarting,
    HashMismatch,
    Failed
}

public enum ClientUpdateHelperResult
{
    Applied,
    RolledBack,
    Failed
}

public sealed record ClientUpdatePlan(
    string InstallDirectory,
    string StagingDirectory,
    string PreviousDirectory,
    string StatePath,
    string ServiceName,
    string AgentProcessName,
    string LogonTaskName,
    string Version,
    string Sha256,
    int ParentProcessId);

public sealed record ClientUpdateState(
    string? FailedVersion = null,
    string? FailedSha256 = null,
    DateTimeOffset? LastFailureAtUtc = null,
    int NextRetryDelaySeconds = 0,
    string? BackoffVersion = null,
    string? BackoffSha256 = null,
    DateTimeOffset? LastSuccessfulCheckAtUtc = null);

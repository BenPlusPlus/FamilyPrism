namespace prismshared;

public sealed class ClientUpdatePaths
{
    public ClientUpdatePaths(
        string updatesDirectory,
        string installDirectory,
        bool applySecureAcl = false)
    {
        UpdatesDirectory = updatesDirectory;
        InstallDirectory = installDirectory;
        ApplySecureAcl = applySecureAcl;
        StagingDirectory = Path.Combine(updatesDirectory, "staging");
        PreviousDirectory = Path.Combine(updatesDirectory, "previous");
        PackageZipPath = Path.Combine(updatesDirectory, "package.zip");
        PlanPath = Path.Combine(updatesDirectory, "update-plan.json");
        StatePath = Path.Combine(updatesDirectory, "update-state.json");
        HelperExecutablePath = Path.Combine(StagingDirectory, PrismConstants.UpdateHelperExecutableName);
    }

    public string UpdatesDirectory { get; }

    public string InstallDirectory { get; }

    public string StagingDirectory { get; }

    public string PreviousDirectory { get; }

    public string PackageZipPath { get; }

    public string PlanPath { get; }

    public string StatePath { get; }

    public string HelperExecutablePath { get; }

    public bool ApplySecureAcl { get; }

    public static ClientUpdatePaths ForMachine() =>
        new(PrismPaths.UpdatesDirectory, PrismPaths.InstalledRoot, applySecureAcl: true);

    public void EnsureUpdatesDirectory()
    {
        var directory = Directory.CreateDirectory(UpdatesDirectory);
        if (ApplySecureAcl)
        {
            PrismAcl.ApplySystemAndAdministratorsOnly(directory);
        }
    }
}

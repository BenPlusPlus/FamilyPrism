using System.Diagnostics;

namespace prismshared;

public interface IUpdatePackageDownloader
{
    Task DownloadAsync(Uri url, string destinationPath, CancellationToken cancellationToken);
}

public interface IProcessLauncher
{
    void StartDetached(string fileName, string arguments, string workingDirectory);
}

public sealed class ClientUpdateCoordinator
{
    public static readonly TimeSpan PeriodicCheckInterval = ClientUpdateSchedule.PeriodicCheckInterval;

    private readonly PrismApiClient apiClient;
    private readonly ClientUpdatePaths paths;
    private readonly Func<ClientUpdateEligibility> getEligibility;
    private readonly Func<string> getLocalVersion;
    private readonly IUpdatePackageDownloader downloader;
    private readonly IProcessLauncher processLauncher;
    private readonly Action requestStop;
    private readonly Action<string>? logInformation;
    private readonly Action<string, Exception?>? logError;
    private readonly Func<DateTimeOffset> getUtcNow;
    private readonly SemaphoreSlim gate = new(1, 1);

    /// <summary>
    /// The result of the most recent check that actually ran (not one skipped by the schedule
    /// or because another check was already in progress). Null until a check runs.
    /// </summary>
    public ClientUpdateCheckReport? LastReport { get; private set; }

    public ClientUpdateCoordinator(
        PrismApiClient apiClient,
        ClientUpdatePaths paths,
        Func<ClientUpdateEligibility> getEligibility,
        Func<string> getLocalVersion,
        IUpdatePackageDownloader downloader,
        IProcessLauncher processLauncher,
        Action requestStop,
        Action<string>? logInformation = null,
        Action<string, Exception?>? logError = null,
        Func<DateTimeOffset>? getUtcNow = null)
    {
        this.apiClient = apiClient;
        this.paths = paths;
        this.getEligibility = getEligibility;
        this.getLocalVersion = getLocalVersion;
        this.downloader = downloader;
        this.processLauncher = processLauncher;
        this.requestStop = requestStop;
        this.logInformation = logInformation;
        this.logError = logError;
        this.getUtcNow = getUtcNow ?? (() => DateTimeOffset.UtcNow);
    }

    public static ClientUpdateCoordinator CreateDefault(
        string hostMode,
        PrismApiClient apiClient,
        Action requestStop,
        Action<string>? logInformation = null,
        Action<string, Exception?>? logError = null)
    {
        return new ClientUpdateCoordinator(
            apiClient,
            ClientUpdatePaths.ForMachine(),
            () => ClientUpdateEligibility.FromEnvironment(hostMode),
            PrismAgentRuntime.GetAssemblyVersion,
            new HttpsUpdatePackageDownloader(),
            new DetachedProcessLauncher(),
            requestStop,
            logInformation,
            logError);
    }

    public async Task<ClientUpdateOutcome> CheckAsync(
        PrismConfiguration configuration,
        CancellationToken cancellationToken,
        ClientUpdateCheckTrigger trigger = ClientUpdateCheckTrigger.Start)
    {
        if (!gate.Wait(0))
        {
            return ClientUpdateOutcome.Skipped;
        }

        try
        {
            var eligibility = getEligibility();
            if (!eligibility.CanCheck)
            {
                logInformation?.Invoke("Client update check skipped: install is not an eligible machine-scope service.");
                Report(ClientUpdateOutcome.Skipped, "Updates are only applied by the installed Family Prism service.");
                return ClientUpdateOutcome.Skipped;
            }

            var now = getUtcNow();
            var state = ClientUpdateStateStore.Read(paths.StatePath);
            if (!ClientUpdateSchedule.ShouldCheck(trigger, state, now))
            {
                if (ClientUpdateStateStore.IsInBackoff(state, now))
                {
                    logInformation?.Invoke("Client update skipped: waiting to retry after a previous failure.");
                }
                else
                {
                    logInformation?.Invoke("Client update skipped: last successful check was recent.");
                }

                return ClientUpdateOutcome.Skipped;
            }

            var localVersion = getLocalVersion();
            ClientUpdateManifest manifest;

            try
            {
                manifest = await apiClient.GetUpdateManifestAsync(configuration, localVersion, cancellationToken);
            }
            catch (Exception ex)
            {
                logError?.Invoke("The client update manifest could not be retrieved.", ex);
                PersistTransientFailure(state, now);
                Report(ClientUpdateOutcome.Failed, $"Could not reach the server: {ex.Message}");
                return ClientUpdateOutcome.Failed;
            }

            var decision = ClientUpdatePlanner.Decide(
                eligibility,
                localVersion,
                manifest,
                ClientUpdateStateStore.GetFailedPin(state));

            if (decision is ClientUpdateDecision.Skip skip)
            {
                logInformation?.Invoke($"Client update skipped: {skip.Reason}.");
                Report(ClientUpdateOutcome.Skipped, DescribeSkip(skip.Reason, localVersion, manifest));
                if (skip.Reason == ClientUpdateSkipReason.FailedPin)
                {
                    PersistTransientFailure(state, now);
                }
                else
                {
                    PersistSuccess(state, now);
                }

                return ClientUpdateOutcome.Skipped;
            }

            var package = ((ClientUpdateDecision.Apply)decision).Package;
            paths.EnsureUpdatesDirectory();

            try
            {
                await downloader.DownloadAsync(new Uri(package.Url), paths.PackageZipPath, cancellationToken);
            }
            catch (Exception ex)
            {
                logError?.Invoke("The client update package could not be downloaded.", ex);
                PersistTransientFailure(state, now, package);
                Report(ClientUpdateOutcome.Failed, $"Version {package.Version} could not be downloaded: {ex.Message}");
                return ClientUpdateOutcome.Failed;
            }

            var staged = ClientUpdateStager.Stage(paths.PackageZipPath, package.Sha256, paths.StagingDirectory);
            if (staged is ClientUpdateStageResult.HashMismatch)
            {
                logError?.Invoke("The client update package hash did not match the manifest. Staging was deleted.", null);
                PersistTransientFailure(state, now, package);
                Report(ClientUpdateOutcome.HashMismatch, $"Version {package.Version} failed verification and was discarded.");
                return ClientUpdateOutcome.HashMismatch;
            }

            if (!File.Exists(paths.HelperExecutablePath))
            {
                logError?.Invoke($"The update helper was not found at '{paths.HelperExecutablePath}'.", null);
                PersistTransientFailure(state, now, package);
                Report(ClientUpdateOutcome.Failed, $"Version {package.Version} is missing its update helper.");
                return ClientUpdateOutcome.Failed;
            }

            var plan = new ClientUpdatePlan(
                paths.InstallDirectory,
                paths.StagingDirectory,
                paths.PreviousDirectory,
                paths.StatePath,
                PrismConstants.ServiceName,
                PrismConstants.AgentProcessName,
                PrismConstants.LogonTaskName,
                package.Version,
                package.Sha256,
                Environment.ProcessId);

            AtomicJsonFileStore.Write(paths.PlanPath, plan);
            processLauncher.StartDetached(
                paths.HelperExecutablePath,
                $"--plan \"{paths.PlanPath}\"",
                paths.UpdatesDirectory);
            PersistSuccess(state, now);
            logInformation?.Invoke($"Applying client update {package.Version}; stopping the service for the helper swap.");
            Report(ClientUpdateOutcome.StagedAndRestarting, $"Installing version {package.Version}. The agent will restart.");
            requestStop();
            return ClientUpdateOutcome.StagedAndRestarting;
        }
        finally
        {
            gate.Release();
        }
    }

    private void Report(ClientUpdateOutcome outcome, string summary)
    {
        LastReport = new ClientUpdateCheckReport(getUtcNow(), outcome, summary);
    }

    private static string DescribeSkip(
        ClientUpdateSkipReason reason,
        string localVersion,
        ClientUpdateManifest manifest)
    {
        var remoteVersion = manifest.Package?.Version;
        return reason switch
        {
            ClientUpdateSkipReason.VersionNotGreater => $"Up to date (version {localVersion}).",
            ClientUpdateSkipReason.NoPackage => "Up to date. The server has no update published.",
            ClientUpdateSkipReason.FailedPin =>
                $"Version {remoteVersion} failed to start on this PC earlier and was rolled back. Waiting for a newer release.",
            ClientUpdateSkipReason.KindNotSupported or ClientUpdateSkipReason.LayoutGenerationTooNew =>
                $"Version {remoteVersion} cannot be applied automatically. Install it manually.",
            ClientUpdateSkipReason.Unconfigured => "Finish setup before checking for updates.",
            ClientUpdateSkipReason.AlreadyInProgress => "An update is already in progress.",
            _ => "Updates are only applied by the installed Family Prism service."
        };
    }

    private void PersistSuccess(ClientUpdateState state, DateTimeOffset now)
    {
        ClientUpdateStateStore.Write(paths.StatePath, ClientUpdateStateStore.RecordSuccess(state, now));
    }

    private void PersistTransientFailure(
        ClientUpdateState state,
        DateTimeOffset now,
        ClientUpdatePackage? package = null)
    {
        ClientUpdateStateStore.Write(paths.StatePath, ClientUpdateStateStore.RecordTransientFailure(state, now, package));
    }
}

public sealed class HttpsUpdatePackageDownloader : IUpdatePackageDownloader
{
    private readonly HttpClient httpClient;

    public HttpsUpdatePackageDownloader(HttpClient? httpClient = null)
    {
        this.httpClient = httpClient ?? new HttpClient();
    }

    public async Task DownloadAsync(Uri url, string destinationPath, CancellationToken cancellationToken)
    {
        if (url.Scheme != Uri.UriSchemeHttps)
        {
            throw new InvalidOperationException("Client updates must be downloaded over HTTPS.");
        }

        var directory = Path.GetDirectoryName(destinationPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        using var response = await httpClient.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var destination = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None);
        await response.Content.CopyToAsync(destination, cancellationToken);
    }
}

public sealed class DetachedProcessLauncher : IProcessLauncher
{
    public void StartDetached(string fileName, string arguments, string workingDirectory)
    {
        var process = Process.Start(new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true
        }) ?? throw new InvalidOperationException($"The update helper '{fileName}' could not be started.");

        process.Dispose();
    }
}

namespace prismshared;

internal enum DnsOverlayRestoreOutcome
{
    /// <summary>A retry is scheduled and its backoff has not elapsed; nothing was attempted.</summary>
    Deferred,

    /// <summary>Standing DNS is back and the server accepted the report. The overlay state is cleared.</summary>
    Restored,

    /// <summary>Standing DNS is back, but the server report failed. Only the report is retried.</summary>
    RestoredReportPending,

    /// <summary>No network adapter was up to restore (for example, Wi-Fi still reconnecting after wake).</summary>
    AdaptersNotReady,

    /// <summary>Writing standing DNS to an adapter failed. The restore is retried.</summary>
    Failed
}

internal sealed record DnsOverlayRestoreResult(
    DnsOverlayRestoreOutcome Outcome,
    bool StandingAppliedNow,
    string? Error = null);

/// <summary>
/// Puts standing DNS back once an overlay runs out. A failed restore is never given up on, because
/// clearing the overlay state would leave the overlay profile in effect forever; it is retried with
/// backoff until it succeeds or a newer DNS command replaces the overlay. Once standing DNS is back,
/// that fact is persisted so a failing server report is retried without writing DNS again.
/// </summary>
internal sealed class DnsOverlayRestorer
{
    internal static readonly TimeSpan InitialRetryDelay = TimeSpan.FromSeconds(2);
    internal static readonly TimeSpan MaxRetryDelay = TimeSpan.FromMinutes(1);

    private readonly DnsConfigurationService dnsConfigurationService;
    private readonly Action<string, Exception?>? logError;
    private readonly string? statePath;

    // Retry tracking is in memory: a Service restart retries immediately, which is what we want.
    private string? retryKey;
    private int failedAttempts;
    private long nextAttemptTickMs;
    private bool failureReported;

    public DnsOverlayRestorer(
        DnsConfigurationService dnsConfigurationService,
        Action<string, Exception?>? logError = null,
        string? statePath = null)
    {
        this.dnsConfigurationService = dnsConfigurationService;
        this.logError = logError;
        this.statePath = statePath;
    }

    public async Task<DnsOverlayRestoreResult> RestoreAsync(
        DnsOverlayPersistedState state,
        Func<DnsDirectiveResult, CancellationToken, Task> report,
        long nowTickMs,
        CancellationToken cancellationToken)
    {
        // An extension moves the deadline, so a later expiry starts over without stale backoff.
        var key = $"{state.RestoreCommandId}|{state.ExpiresAtUtc:O}";
        if (!string.Equals(retryKey, key, StringComparison.Ordinal))
        {
            retryKey = key;
            ResetRetry();
        }

        if (failedAttempts > 0 && nowTickMs < nextAttemptTickMs)
        {
            return new DnsOverlayRestoreResult(DnsOverlayRestoreOutcome.Deferred, StandingAppliedNow: false);
        }

        var appliedNow = false;
        if (!state.StandingRestored)
        {
            var result = state.HasStandingProfile
                ? dnsConfigurationService.Apply(state.StandingPrimaryIp!, state.StandingSecondaryIp)
                : dnsConfigurationService.ResetToDhcp();

            if (!result.Succeeded)
            {
                ScheduleRetry(nowTickMs);

                if (result.AdapterResults.Count == 0)
                {
                    return new DnsOverlayRestoreResult(
                        DnsOverlayRestoreOutcome.AdaptersNotReady,
                        StandingAppliedNow: false,
                        result.Error);
                }

                if (!failureReported)
                {
                    failureReported = await TryReportAsync(
                        report,
                        new DnsDirectiveResult(state.RestoreCommandId, "failed", result.Error),
                        cancellationToken);
                }

                return new DnsOverlayRestoreResult(
                    DnsOverlayRestoreOutcome.Failed,
                    StandingAppliedNow: false,
                    result.Error);
            }

            state = state with { StandingRestored = true };
            DnsOverlayStateStore.Write(state, statePath);
            appliedNow = true;
        }

        var reported = await TryReportAsync(
            report,
            new DnsDirectiveResult(state.RestoreCommandId, "applied"),
            cancellationToken);

        if (!reported)
        {
            ScheduleRetry(nowTickMs);
            return new DnsOverlayRestoreResult(DnsOverlayRestoreOutcome.RestoredReportPending, appliedNow);
        }

        DnsOverlayStateStore.Clear(statePath);
        ResetRetry();
        return new DnsOverlayRestoreResult(DnsOverlayRestoreOutcome.Restored, appliedNow);
    }

    private async Task<bool> TryReportAsync(
        Func<DnsDirectiveResult, CancellationToken, Task> report,
        DnsDirectiveResult result,
        CancellationToken cancellationToken)
    {
        try
        {
            await report(result, cancellationToken);
            return true;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            logError?.Invoke("The Family Prism DNS restore report could not be sent.", ex);
            return false;
        }
    }

    private void ScheduleRetry(long nowTickMs)
    {
        failedAttempts++;
        var delayMs = InitialRetryDelay.TotalMilliseconds * Math.Pow(2, Math.Min(failedAttempts - 1, 16));
        nextAttemptTickMs = nowTickMs + (long)Math.Min(delayMs, MaxRetryDelay.TotalMilliseconds);
    }

    private void ResetRetry()
    {
        failedAttempts = 0;
        nextAttemptTickMs = 0;
        failureReported = false;
    }
}

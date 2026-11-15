namespace prismbridge;

/// <summary>Remembers a failed login so the bridge stops trying until the router credentials change.</summary>
public interface ILoginBlockStore
{
    BridgeFailure? Current { get; }

    void Block(BridgeFailure failure);
}

/// <summary>Runs one reconcile pass against the router (ADR 0008).</summary>
public sealed class BridgeReconciler(
    IRouterDriver driver,
    ILoginBlockStore loginBlock,
    Func<IReadOnlySet<string>> protectedMacs,
    Action<string>? logInformation = null)
{
    public async Task<ReconcileReport> RunAsync(
        DesiredState state,
        DateTimeOffset localNow,
        CancellationToken cancellationToken)
    {
        if (loginBlock.Current is { } blocked)
        {
            return ReconcileReport.Failed(blocked);
        }

        try
        {
            try
            {
                return await PassAsync(state, localNow, cancellationToken);
            }
            catch (RouterSessionExpiredException)
            {
                // Someone logged in from this PC, the session timed out, or the router restarted.
                return await PassAsync(state, localNow, cancellationToken);
            }
        }
        catch (RouterSessionExpiredException)
        {
            return ReconcileReport.Failed(new BridgeFailure(BridgeFailureCode.Unexpected, "The router kept ending the bridge's session."));
        }
        catch (RouterException exception)
        {
            var failure = new BridgeFailure(exception.Code, exception.Message);
            if (exception.Code is BridgeFailureCode.LoginFailed or BridgeFailureCode.LockedOut)
            {
                loginBlock.Block(failure);
            }

            return ReconcileReport.Failed(failure);
        }
    }

    private async Task<ReconcileReport> PassAsync(DesiredState state, DateTimeOffset localNow, CancellationToken cancellationToken)
    {
        await using var session = await driver.OpenAsync(cancellationToken);
        var table = await session.ReadTableAsync(cancellationToken);
        var plan = ReconcilePlanner.Plan(state, table, localNow, protectedMacs());
        if (!plan.HasChanges)
        {
            return new ReconcileReport(table.Entries, plan.Failures, null);
        }

        var failures = plan.Failures.ToList();

        // Highest position first, so the positions still to delete don't move.
        foreach (var delete in plan.Deletes)
        {
            if (!string.Equals(MacAddress.Normalize(table.Entries[delete.Index].Mac), MacAddress.Normalize(delete.Mac), StringComparison.OrdinalIgnoreCase))
            {
                throw new RouterException(BridgeFailureCode.Unexpected, "The router's table changed during the pass.");
            }

            await session.DeleteAsync(delete.Index, cancellationToken);
            logInformation?.Invoke($"Unblocked {delete.Mac}.");
        }

        var count = table.Entries.Count - plan.Deletes.Count;
        foreach (var add in plan.Adds)
        {
            try
            {
                await session.AddAsync(count, add.Name, add.Mac, cancellationToken);
                count++;
                logInformation?.Invoke($"Blocked {add.Mac} ({add.Name}).");
            }
            catch (RouterException exception) when (exception.Code == BridgeFailureCode.Unexpected)
            {
                failures.Add(new DeviceFailure(add.DeviceId, DeviceFailureCode.Unexpected, exception.Message));
            }
        }

        // Report what the router holds now, not what was meant to happen.
        var after = await session.ReadTableAsync(cancellationToken);
        return new ReconcileReport(after.Entries, failures, null);
    }
}

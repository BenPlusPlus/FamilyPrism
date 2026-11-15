using System.Net;
using System.Net.NetworkInformation;
using System.Net.WebSockets;
using System.Reflection;
using System.Text;
using System.Threading.Channels;

namespace prismbridge;

/// <summary>
/// Keeps the router matched to the server's desired state (ADR 0008). The reconcile loop runs on
/// its own, from the saved state, so blocks and time limits hold while the server is unreachable.
/// </summary>
public sealed class BridgeRuntime
{
    /// <summary>How often the router is checked when nothing else happens, to undo hand edits and resets.</summary>
    public static readonly TimeSpan PeriodicPass = TimeSpan.FromMinutes(5);

    /// <summary>A sooner retry after the router was busy or unreachable.</summary>
    public static readonly TimeSpan RetryPass = TimeSpan.FromMinutes(1);

    private readonly BridgeConfiguration configuration;
    private readonly IRouterDriver driver;
    private readonly BridgeReconciler reconciler;
    private readonly DesiredStateStore stateStore;
    private readonly ILoginBlockStore loginBlock;
    private readonly Action<string> logInformation;
    private readonly Action<string, Exception?> logError;
    private readonly Channel<bool> passRequests = Channel.CreateBounded<bool>(
        new BoundedChannelOptions(1) { FullMode = BoundedChannelFullMode.DropWrite });
    private readonly SemaphoreSlim sendLock = new(1, 1);
    private volatile DesiredState state;
    private volatile ClientWebSocket? socket;

    public BridgeRuntime(
        BridgeConfiguration configuration,
        IRouterDriver driver,
        DesiredStateStore stateStore,
        ILoginBlockStore loginBlock,
        Action<string> logInformation,
        Action<string, Exception?> logError)
    {
        this.configuration = configuration;
        this.driver = driver;
        this.stateStore = stateStore;
        this.loginBlock = loginBlock;
        this.logInformation = logInformation;
        this.logError = logError;
        reconciler = new BridgeReconciler(driver, loginBlock, LocalMacAddresses.Get, logInformation);
        state = stateStore.Load();
    }

    public static string Version
    {
        get
        {
            var raw = typeof(BridgeRuntime).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
                ?? typeof(BridgeRuntime).Assembly.GetName().Version?.ToString()
                ?? "0.0.0";
            var plus = raw.IndexOf('+');
            return plus >= 0 ? raw[..plus] : raw;
        }
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        RequestPass();
        await Task.WhenAll(RunReconcileLoopAsync(cancellationToken), RunSocketLoopAsync(cancellationToken));
    }

    private void RequestPass() => passRequests.Writer.TryWrite(true);

    private async Task RunReconcileLoopAsync(CancellationToken cancellationToken)
    {
        var nextRoutinePass = DateTimeOffset.UtcNow;
        while (!cancellationToken.IsCancellationRequested)
        {
            var now = DateTimeOffset.UtcNow;
            var wakeAt = nextRoutinePass;
            if (state.NextDeadline(now) is { } deadline && deadline < wakeAt)
            {
                // A moment past the deadline, so the change has certainly ended.
                wakeAt = deadline + TimeSpan.FromMilliseconds(250);
            }

            using (var wait = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken))
            {
                var delay = wakeAt - now;
                if (delay > TimeSpan.Zero)
                {
                    wait.CancelAfter(delay);
                    try
                    {
                        await passRequests.Reader.WaitToReadAsync(wait.Token);
                    }
                    catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
                    {
                    }
                }
            }

            cancellationToken.ThrowIfCancellationRequested();
            while (passRequests.Reader.TryRead(out _))
            {
            }

            ReconcileReport report;
            try
            {
                report = await reconciler.RunAsync(state, DateTimeOffset.UtcNow, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logError("A reconcile pass failed unexpectedly.", exception);
                report = ReconcileReport.Failed(new BridgeFailure(BridgeFailureCode.Unexpected, exception.Message));
            }

            if (report.Error is { } error)
            {
                logInformation($"Reconcile pass failed: {error.Code} {error.Message}");
            }

            var retrySoon = report.Error is { Code: BridgeFailureCode.Unreachable or BridgeFailureCode.RouterBusy or BridgeFailureCode.Unexpected };
            nextRoutinePass = DateTimeOffset.UtcNow + (retrySoon ? RetryPass : PeriodicPass);
            await SendAsync(BridgeProtocol.Report(report), cancellationToken);
        }
    }

    private async Task RunSocketLoopAsync(CancellationToken cancellationToken)
    {
        var retryDelay = TimeSpan.FromSeconds(5);
        while (!cancellationToken.IsCancellationRequested)
        {
            using var websocket = new ClientWebSocket();
            websocket.Options.CollectHttpResponseDetails = true;
            websocket.Options.SetRequestHeader("x-bridge-id", configuration.BridgeId);
            websocket.Options.SetRequestHeader("Authorization", $"Bearer {configuration.Credential}");

            try
            {
                await websocket.ConnectAsync(configuration.WebsocketUri, cancellationToken);
                socket = websocket;
                retryDelay = TimeSpan.FromSeconds(5);
                logInformation($"Connected to {configuration.WebsocketUri}.");
                await SendAsync(BridgeProtocol.Identify(Version, driver.Model), cancellationToken);
                await ReceiveAsync(websocket, cancellationToken);
                logInformation("Disconnected from the server.");
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                if (websocket.HttpStatusCode == HttpStatusCode.Unauthorized)
                {
                    logError("The server turned down the bridge's credential. If the bridge was removed in Settings, run 'prismbridge setup' again.", null);
                    retryDelay = TimeSpan.FromMinutes(5);
                }
                else
                {
                    logError("The connection to the server failed.", exception);
                }
            }
            finally
            {
                socket = null;
            }

            try
            {
                await Task.Delay(retryDelay, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }

            retryDelay = TimeSpan.FromSeconds(Math.Min(retryDelay.TotalSeconds * 2, Math.Max(60, retryDelay.TotalSeconds)));
        }
    }

    private async Task ReceiveAsync(ClientWebSocket websocket, CancellationToken cancellationToken)
    {
        var buffer = new byte[16 * 1024];
        using var message = new MemoryStream();
        while (websocket.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
        {
            var result = await websocket.ReceiveAsync(buffer, cancellationToken);
            if (result.MessageType == WebSocketMessageType.Close)
            {
                return;
            }

            message.Write(buffer, 0, result.Count);
            if (!result.EndOfMessage)
            {
                continue;
            }

            var json = Encoding.UTF8.GetString(message.GetBuffer(), 0, (int)message.Length);
            message.SetLength(0);
            Handle(BridgeProtocol.Parse(json, DateTimeOffset.UtcNow));
        }
    }

    private void Handle(ServerMessage? message)
    {
        switch (message)
        {
            case ServerMessage.Desired desired:
                state = desired.State;
                try
                {
                    stateStore.Save(desired.State);
                }
                catch (Exception exception)
                {
                    logError("The desired state couldn't be saved; it still applies until the bridge restarts.", exception);
                }

                RequestPass();
                break;
            case ServerMessage.ReconcileNow:
                RequestPass();
                break;
        }
    }

    private async Task SendAsync(string json, CancellationToken cancellationToken)
    {
        var current = socket;
        if (current is null || current.State != WebSocketState.Open)
        {
            return;
        }

        await sendLock.WaitAsync(cancellationToken);
        try
        {
            await current.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text, true, cancellationToken);
        }
        catch (Exception exception) when (exception is WebSocketException or ObjectDisposedException)
        {
            // The socket loop notices the broken connection and reconnects; the next pass reports again.
        }
        finally
        {
            sendLock.Release();
        }
    }
}

public static class LocalMacAddresses
{
    /// <summary>This PC's own addresses, which the bridge never blocks (it would cut itself off).</summary>
    public static IReadOnlySet<string> Get() =>
        NetworkInterface.GetAllNetworkInterfaces()
            .Select(nic => nic.GetPhysicalAddress().GetAddressBytes())
            .Where(bytes => bytes.Length == 6)
            .Select(bytes => string.Join('-', bytes.Select(value => value.ToString("X2"))))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
}

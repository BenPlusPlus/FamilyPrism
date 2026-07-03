using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace prismshared;

public sealed class PrismAgentRuntime
{
    private readonly string hostMode;
    private readonly Action<string>? logInformation;
    private readonly Action<string, Exception?>? logError;

    public PrismAgentRuntime(
        string hostMode,
        Action<string>? logInformation = null,
        Action<string, Exception?>? logError = null)
    {
        this.hostMode = hostMode;
        this.logInformation = logInformation;
        this.logError = logError;
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        var retryDelay = TimeSpan.FromSeconds(5);

        while (!cancellationToken.IsCancellationRequested)
        {
            PrismConfiguration configuration;

            try
            {
                if (!MachineConfigurationStore.HasSecureConfiguration())
                {
                    WriteStatus(
                        configuration: null,
                        PrismConnectionState.NotConfigured,
                        "Waiting for setup.",
                        lastError: null);

                    await Task.Delay(TimeSpan.FromSeconds(15), cancellationToken);
                    continue;
                }

                configuration = MachineConfigurationStore.Load();
            }
            catch (CryptographicException ex)
            {
                logError?.Invoke("The stored Family Prism credentials could not be decrypted.", ex);
                WriteStatus(
                    configuration: null,
                    PrismConnectionState.Error,
                    "Stored credentials could not be read. Run setup again.",
                    lastError: ex.Message);

                await Task.Delay(TimeSpan.FromSeconds(30), cancellationToken);
                continue;
            }
            catch (Exception ex)
            {
                logError?.Invoke("The Family Prism agent could not load its configuration.", ex);
                WriteStatus(
                    configuration: null,
                    PrismConnectionState.Error,
                    "The agent configuration could not be loaded.",
                    lastError: ex.Message);

                await Task.Delay(retryDelay, cancellationToken);
                retryDelay = NextRetryDelay(retryDelay);
                continue;
            }

            try
            {
                await RunSocketSessionAsync(configuration, cancellationToken);
                retryDelay = TimeSpan.FromSeconds(5);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logError?.Invoke("The Family Prism websocket connection failed.", ex);
                WriteStatus(
                    configuration,
                    PrismConnectionState.Error,
                    "The connection to the server was lost. Retrying...",
                    lastError: ex.Message);

                await Task.Delay(retryDelay, cancellationToken);
                retryDelay = NextRetryDelay(retryDelay);
            }
        }
    }

    private async Task RunSocketSessionAsync(PrismConfiguration configuration, CancellationToken cancellationToken)
    {
        WriteStatus(
            configuration,
            PrismConnectionState.Connecting,
            "Connecting to the server...",
            lastError: null);

        using var websocket = new ClientWebSocket();
        websocket.Options.SetRequestHeader("x-client-id", configuration.ClientId);
        websocket.Options.SetRequestHeader("Authorization", $"Bearer {configuration.Credential}");

        var websocketUri = BuildWebsocketUri(configuration);
        await websocket.ConnectAsync(websocketUri, cancellationToken);
        await SendIdentifyMessageAsync(websocket, cancellationToken);
        logInformation?.Invoke($"Connected to {websocketUri}.");

        WriteStatus(
            configuration,
            PrismConnectionState.Connected,
            "Connected to the server.",
            lastError: null,
            lastConnectedAtUtc: DateTimeOffset.UtcNow);

        var buffer = new byte[8192];
        using var messageBuffer = new MemoryStream();

        while (!cancellationToken.IsCancellationRequested && websocket.State == WebSocketState.Open)
        {
            var result = await websocket.ReceiveAsync(buffer, cancellationToken);

            if (result.MessageType == WebSocketMessageType.Close)
            {
                break;
            }

            messageBuffer.Write(buffer, 0, result.Count);

            if (!result.EndOfMessage)
            {
                continue;
            }

            var payload = Encoding.UTF8.GetString(messageBuffer.GetBuffer(), 0, (int)messageBuffer.Length);
            messageBuffer.SetLength(0);

            ProcessSocketMessage(configuration, payload);
        }

        WriteStatus(
            configuration,
            PrismConnectionState.Disconnected,
            "Disconnected from the server. Retrying...",
            lastError: null);
    }

    private void ProcessSocketMessage(PrismConfiguration configuration, string payload)
    {
        using var json = JsonDocument.Parse(payload);
        var root = json.RootElement;
        var type = root.TryGetProperty("type", out var typeProperty)
            ? typeProperty.GetString()
            : null;

        switch (type)
        {
            case "connected":
                var name = root.TryGetProperty("name", out var nameProperty)
                    ? nameProperty.GetString()
                    : configuration.ClientName;

                logInformation?.Invoke($"Family Prism connection acknowledged for {name ?? configuration.ClientName}.");
                WriteStatus(
                    configuration with { ClientName = name ?? configuration.ClientName },
                    PrismConnectionState.Connected,
                    "Connected to the server.",
                    lastError: null,
                    lastConnectedAtUtc: DateTimeOffset.UtcNow);
                break;

            case "display-message":
                var messageId = root.TryGetProperty("messageId", out var idProperty)
                    ? idProperty.GetString()
                    : null;
                var text = root.TryGetProperty("text", out var textProperty)
                    ? textProperty.GetString()
                    : null;

                logInformation?.Invoke($"Received display-message '{messageId ?? "(no id)"}'.");
                WriteStatus(
                    configuration,
                    PrismConnectionState.Connected,
                    "Connected to the server.",
                    lastError: null,
                    lastMessageId: messageId,
                    lastMessageText: text,
                    lastMessageReceivedAtUtc: DateTimeOffset.UtcNow);
                break;

            case "take-screenshot":
                PendingScreenshotRequestStore.Write(new PendingScreenshotRequestPayload(DateTimeOffset.UtcNow));
                logInformation?.Invoke("Queued a take-screenshot request for the interactive tray session.");
                WriteStatus(
                    configuration,
                    PrismConnectionState.Connected,
                    "Connected to the server. Screenshot requested.",
                    lastError: null);
                break;

            default:
                logInformation?.Invoke($"Received websocket message of type '{type ?? "unknown"}'.");
                WriteStatus(
                    configuration,
                    PrismConnectionState.Connected,
                    $"Connected to the server. Last message type: {type ?? "unknown"}.",
                    lastError: null);
                break;
        }
    }

    private void WriteStatus(
        PrismConfiguration? configuration,
        PrismConnectionState connectionState,
        string statusMessage,
        string? lastError,
        string? lastMessageId = null,
        string? lastMessageText = null,
        DateTimeOffset? lastConnectedAtUtc = null,
        DateTimeOffset? lastMessageReceivedAtUtc = null)
    {
        var currentStatus = PrismStatusStore.ReadOrDefault();

        PrismStatusStore.Save(currentStatus with
        {
            IsSetupComplete = configuration is not null,
            HostMode = hostMode,
            ConnectionState = connectionState,
            StatusMessage = statusMessage,
            ServerBaseUrl = configuration?.ServerBaseUrl ?? currentStatus.ServerBaseUrl,
            ClientId = configuration?.ClientId ?? currentStatus.ClientId,
            ClientName = configuration?.ClientName ?? currentStatus.ClientName,
            LastError = lastError,
            LastMessageId = lastMessageId ?? currentStatus.LastMessageId,
            LastMessageText = lastMessageText ?? currentStatus.LastMessageText,
            LastConnectedAtUtc = lastConnectedAtUtc ?? currentStatus.LastConnectedAtUtc,
            LastMessageReceivedAtUtc = lastMessageReceivedAtUtc ?? currentStatus.LastMessageReceivedAtUtc
        });
    }

    private static async Task SendIdentifyMessageAsync(
        ClientWebSocket websocket,
        CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.Serialize(new
        {
            type = "identify",
            windowsUser = GetCurrentWindowsUser()
        });

        await websocket.SendAsync(
            Encoding.UTF8.GetBytes(payload),
            WebSocketMessageType.Text,
            true,
            cancellationToken);
    }

    private static string GetCurrentWindowsUser()
    {
        var identityName = System.Security.Principal.WindowsIdentity.GetCurrent()?.Name;
        if (!string.IsNullOrWhiteSpace(identityName))
        {
            var localAccountPrefix = $"{Environment.MachineName}\\";
            return identityName.StartsWith(localAccountPrefix, StringComparison.OrdinalIgnoreCase)
                ? Environment.UserName
                : identityName;
        }

        if (!string.Equals(
            Environment.UserDomainName,
            Environment.MachineName,
            StringComparison.OrdinalIgnoreCase))
        {
            return $"{Environment.UserDomainName}\\{Environment.UserName}";
        }

        return Environment.UserName;
    }

    private static Uri BuildWebsocketUri(PrismConfiguration configuration)
    {
        var endpoint = new Uri(new Uri(configuration.ServerBaseUrl), configuration.WebsocketPath);
        var builder = new UriBuilder(endpoint)
        {
            Scheme = endpoint.Scheme == Uri.UriSchemeHttps ? "wss" : "ws"
        };

        return builder.Uri;
    }

    private static TimeSpan NextRetryDelay(TimeSpan currentDelay)
    {
        var nextDelay = TimeSpan.FromSeconds(currentDelay.TotalSeconds * 2);
        return nextDelay > TimeSpan.FromMinutes(1)
            ? TimeSpan.FromMinutes(1)
            : nextDelay;
    }
}

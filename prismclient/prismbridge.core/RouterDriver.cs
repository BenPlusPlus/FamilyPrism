namespace prismbridge;

/// <summary>One router model. The server never knows which one is in use (ADR 0007).</summary>
public interface IRouterDriver
{
    string Model { get; }

    /// <summary>Logs in. Dispose the session to log out, so the router's single admin session is freed quickly.</summary>
    Task<IRouterSession> OpenAsync(CancellationToken cancellationToken);
}

public interface IRouterSession : IAsyncDisposable
{
    Task<RouterTable> ReadTableAsync(CancellationToken cancellationToken);

    Task AddAsync(int index, string name, string mac, CancellationToken cancellationToken);

    Task DeleteAsync(int index, CancellationToken cancellationToken);
}

public sealed class RouterException(BridgeFailureCode code, string message, Exception? inner = null)
    : Exception(message, inner)
{
    public BridgeFailureCode Code { get; } = code;
}

/// <summary>The router dropped the session (logged out elsewhere, timed out, or replaced). Logging in again fixes it.</summary>
public sealed class RouterSessionExpiredException() : Exception("The router session expired.");

namespace prismagent;

/// <summary>
/// The Family Prism brand icon (Assets\familyprism.ico), embedded so it is available
/// without reading from disk.
/// </summary>
internal static class AgentIcon
{
    private const string ResourceName = "prismagent.familyprism.ico";

    private static readonly Lazy<Icon> windowIcon = new(() => Load(null));

    /// <summary>
    /// Shared icon for form title bars and Alt+Tab. WinForms derives the small title-bar
    /// image from the full multi-size icon, so this instance is reused rather than disposed.
    /// </summary>
    public static Icon Window => windowIcon.Value;

    /// <summary>
    /// Creates an icon sized for the notification area at the current DPI. Callers own it.
    /// </summary>
    public static Icon CreateTrayIcon() => Load(SystemInformation.SmallIconSize);

    private static Icon Load(Size? size)
    {
        using var stream = typeof(AgentIcon).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Embedded resource '{ResourceName}' was not found.");
        return size is { } requested ? new Icon(stream, requested) : new Icon(stream);
    }
}

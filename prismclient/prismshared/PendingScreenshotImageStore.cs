namespace prismshared;

/// <summary>
/// The tray captures the interactive desktop into the shared State directory. The service
/// reads that PNG and uploads it with machine credentials the tray cannot load.
/// </summary>
public static class PendingScreenshotImageStore
{
    /// <remarks>
    /// Called from the tray as a standard user, so this must not touch the directory ACL.
    /// The service creates the State directory (with Users: Modify) when it first writes status.
    /// </remarks>
    public static void Write(byte[] pngBytes) => Write(PrismPaths.PendingScreenshotImagePath, pngBytes);

    public static byte[]? Read() => Read(PrismPaths.PendingScreenshotImagePath);

    public static void Delete() => Delete(PrismPaths.PendingScreenshotImagePath);

    internal static void Write(string path, byte[] pngBytes)
    {
        if (pngBytes.Length == 0)
        {
            throw new InvalidOperationException("A screenshot image is required.");
        }

        var directoryPath = Path.GetDirectoryName(path)
            ?? throw new InvalidOperationException($"Unable to determine the parent directory for '{path}'.");

        Directory.CreateDirectory(directoryPath);

        var tempPath = Path.Combine(
            directoryPath,
            $"{Path.GetFileName(path)}.{Guid.NewGuid():N}.tmp");

        File.WriteAllBytes(tempPath, pngBytes);

        if (File.Exists(path))
        {
            File.Replace(tempPath, path, null);
            return;
        }

        File.Move(tempPath, path);
    }

    internal static byte[]? Read(string path)
    {
        if (!File.Exists(path))
        {
            return null;
        }

        var pngBytes = File.ReadAllBytes(path);
        if (pngBytes.Length == 0)
        {
            Delete(path);
            return null;
        }

        return pngBytes;
    }

    internal static void Delete(string path)
    {
        if (File.Exists(path))
        {
            File.Delete(path);
        }
    }
}

namespace prismshared;

public static class PendingScreenshotUploader
{
    public static Task<bool> TryUploadPendingAsync(
        PrismApiClient apiClient,
        CancellationToken cancellationToken)
    {
        return TryUploadPendingAsync(
            PrismPaths.PendingScreenshotImagePath,
            apiClient,
            MachineConfigurationStore.HasSecureConfiguration,
            MachineConfigurationStore.Load,
            cancellationToken);
    }

    internal static async Task<bool> TryUploadPendingAsync(
        string imagePath,
        PrismApiClient apiClient,
        Func<bool> hasSecureConfiguration,
        Func<PrismConfiguration> loadConfiguration,
        CancellationToken cancellationToken)
    {
        var pngBytes = PendingScreenshotImageStore.Read(imagePath);
        if (pngBytes is null)
        {
            return false;
        }

        if (!hasSecureConfiguration())
        {
            return false;
        }

        var configuration = loadConfiguration();
        await apiClient.UploadScreenshotAsync(configuration, pngBytes, cancellationToken);
        PendingScreenshotImageStore.Delete(imagePath);
        return true;
    }
}

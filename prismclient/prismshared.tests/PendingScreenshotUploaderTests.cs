using System.Net;
using System.Net.Http.Headers;
using prismshared;

namespace prismshared.tests;

public class PendingScreenshotUploaderTests
{
    [Fact]
    public async Task RequestWithoutImageDoesNotUpload()
    {
        using var workspace = new ScreenshotTestWorkspace();
        var handler = new ScreenshotHandler();

        var uploaded = await PendingScreenshotUploader.TryUploadPendingAsync(
            workspace.ImagePath,
            new PrismApiClient(new HttpClient(handler)),
            () => true,
            Configuration,
            CancellationToken.None);

        Assert.False(uploaded);
        Assert.Equal(0, handler.RequestCount);
        Assert.False(File.Exists(workspace.ImagePath));
    }

    [Fact]
    public async Task ImageIsUploadedOnceAndDeleted()
    {
        using var workspace = new ScreenshotTestWorkspace();
        var pngBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A };
        PendingScreenshotImageStore.Write(workspace.ImagePath, pngBytes);
        var handler = new ScreenshotHandler();
        var apiClient = new PrismApiClient(new HttpClient(handler) { BaseAddress = new Uri("https://familyprism.example.test/") });

        var uploaded = await PendingScreenshotUploader.TryUploadPendingAsync(
            workspace.ImagePath,
            apiClient,
            () => true,
            Configuration,
            CancellationToken.None);

        Assert.True(uploaded);
        Assert.Equal(1, handler.RequestCount);
        Assert.Equal(pngBytes, handler.LastBody);
        Assert.Equal("client-1", handler.LastClientId);
        Assert.Equal("pc_secret", handler.LastBearer);
        Assert.False(File.Exists(workspace.ImagePath));

        var uploadedAgain = await PendingScreenshotUploader.TryUploadPendingAsync(
            workspace.ImagePath,
            apiClient,
            () => true,
            Configuration,
            CancellationToken.None);

        Assert.False(uploadedAgain);
        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task FailedUploadLeavesTheImageForRetry()
    {
        using var workspace = new ScreenshotTestWorkspace();
        var pngBytes = new byte[] { 0x89, 0x50, 0x4E, 0x47 };
        PendingScreenshotImageStore.Write(workspace.ImagePath, pngBytes);
        var handler = new ScreenshotHandler { StatusCode = HttpStatusCode.InternalServerError };
        var apiClient = new PrismApiClient(new HttpClient(handler));

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            PendingScreenshotUploader.TryUploadPendingAsync(
                workspace.ImagePath,
                apiClient,
                () => true,
                Configuration,
                CancellationToken.None));

        Assert.True(File.Exists(workspace.ImagePath));
        Assert.Equal(pngBytes, File.ReadAllBytes(workspace.ImagePath));

        handler.StatusCode = HttpStatusCode.OK;
        var uploaded = await PendingScreenshotUploader.TryUploadPendingAsync(
            workspace.ImagePath,
            apiClient,
            () => true,
            Configuration,
            CancellationToken.None);

        Assert.True(uploaded);
        Assert.Equal(2, handler.RequestCount);
        Assert.False(File.Exists(workspace.ImagePath));
    }

    [Fact]
    public async Task MissingConfigurationDoesNotUploadOrDeleteTheImage()
    {
        using var workspace = new ScreenshotTestWorkspace();
        PendingScreenshotImageStore.Write(workspace.ImagePath, [1, 2, 3, 4]);
        var handler = new ScreenshotHandler();

        var uploaded = await PendingScreenshotUploader.TryUploadPendingAsync(
            workspace.ImagePath,
            new PrismApiClient(new HttpClient(handler)),
            () => false,
            () => throw new InvalidOperationException("The Family Prism agent configuration could not be loaded."),
            CancellationToken.None);

        Assert.False(uploaded);
        Assert.Equal(0, handler.RequestCount);
        Assert.True(File.Exists(workspace.ImagePath));
    }

    [Fact]
    public async Task EmptyImageIsDiscardedWithoutUploading()
    {
        using var workspace = new ScreenshotTestWorkspace();
        File.WriteAllBytes(workspace.ImagePath, []);
        var handler = new ScreenshotHandler();

        var uploaded = await PendingScreenshotUploader.TryUploadPendingAsync(
            workspace.ImagePath,
            new PrismApiClient(new HttpClient(handler)),
            () => true,
            Configuration,
            CancellationToken.None);

        Assert.False(uploaded);
        Assert.Equal(0, handler.RequestCount);
        Assert.False(File.Exists(workspace.ImagePath));
    }

    [Fact]
    public void LaterCaptureReplacesTheWaitingImage()
    {
        using var workspace = new ScreenshotTestWorkspace();
        PendingScreenshotImageStore.Write(workspace.ImagePath, [1, 1, 1]);
        PendingScreenshotImageStore.Write(workspace.ImagePath, [2, 2, 2, 2]);

        Assert.Equal(new byte[] { 2, 2, 2, 2 }, PendingScreenshotImageStore.Read(workspace.ImagePath));
        Assert.Empty(Directory.GetFiles(workspace.Root, "*.tmp"));
    }

    [Fact]
    public void WriteRejectsAnEmptyCapture()
    {
        using var workspace = new ScreenshotTestWorkspace();

        var ex = Assert.Throws<InvalidOperationException>(
            () => PendingScreenshotImageStore.Write(workspace.ImagePath, []));

        Assert.Equal("A screenshot image is required.", ex.Message);
        Assert.False(File.Exists(workspace.ImagePath));
    }

    private static PrismConfiguration Configuration()
    {
        return new PrismConfiguration(
            "https://familyprism.example.test/",
            "client-1",
            "Kitchen PC",
            "pc_secret",
            "/ws");
    }

    private sealed class ScreenshotTestWorkspace : IDisposable
    {
        public ScreenshotTestWorkspace()
        {
            Root = Path.Combine(Path.GetTempPath(), "FamilyPrismScreenshotTests", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Root);
            ImagePath = Path.Combine(Root, "pending-screenshot.png");
        }

        public string Root { get; }

        public string ImagePath { get; }

        public void Dispose()
        {
            try
            {
                Directory.Delete(Root, recursive: true);
            }
            catch
            {
            }
        }
    }

    private sealed class ScreenshotHandler : HttpMessageHandler
    {
        public int RequestCount { get; private set; }

        public byte[]? LastBody { get; private set; }

        public string? LastClientId { get; private set; }

        public string? LastBearer { get; private set; }

        public HttpStatusCode StatusCode { get; set; } = HttpStatusCode.OK;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestCount++;
            LastClientId = request.Headers.TryGetValues("x-client-id", out var clientIds)
                ? clientIds.Single()
                : null;
            LastBearer = request.Headers.Authorization is AuthenticationHeaderValue authorization
                ? authorization.Parameter
                : null;
            LastBody = request.Content is null
                ? null
                : await request.Content.ReadAsByteArrayAsync(cancellationToken);

            return new HttpResponseMessage(StatusCode)
            {
                RequestMessage = request,
                Content = new StringContent(StatusCode == HttpStatusCode.OK ? string.Empty : "upload failed")
            };
        }
    }
}

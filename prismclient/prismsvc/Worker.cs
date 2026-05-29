using Microsoft.Extensions.Hosting.WindowsServices;
using prismshared;

namespace prismsvc;

public class Worker(ILogger<Worker> logger) : BackgroundService
{
    private readonly PrismAgentRuntime runtime = new(
        WindowsServiceHelpers.IsWindowsService() ? "WindowsService" : "Process",
        message => logger.LogInformation("{Message}", message),
        (message, exception) => logger.LogError(exception, "{Message}", message));

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        return runtime.RunAsync(stoppingToken);
    }
}

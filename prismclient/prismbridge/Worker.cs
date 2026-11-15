using System.Security.Cryptography;
using prismbridge;

namespace prismbridge.service;

public sealed class Worker(ILogger<Worker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            BridgeConfiguration configuration;
            try
            {
                if (!BridgeConfigurationStore.Exists())
                {
                    logger.LogWarning("The Router bridge isn't set up. Run 'prismbridge setup' as administrator.");
                    await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
                    continue;
                }

                configuration = BridgeConfigurationStore.Load();
            }
            catch (CryptographicException exception)
            {
                logger.LogError(exception, "The saved bridge setup couldn't be decrypted. Run 'prismbridge setup' again.");
                await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
                continue;
            }

            var runtime = new BridgeRuntime(
                configuration,
                new SavedLoginRouterDriver(),
                DesiredStateStore.Default,
                FileLoginBlockStore.Default,
                message => logger.LogInformation("{Message}", message),
                (message, exception) => logger.LogError(exception, "{Message}", message));

            logger.LogInformation("Router bridge {Version} starting for {Router}.", BridgeRuntime.Version, configuration.RouterBaseUri);
            await runtime.RunAsync(stoppingToken);
        }
    }
}

/// <summary>Reads the saved router login on every pass, so 'prismbridge router-login' takes effect without a restart.</summary>
internal sealed class SavedLoginRouterDriver : IRouterDriver
{
    public string Model => TlR600VpnDriver.ModelName;

    public Task<IRouterSession> OpenAsync(CancellationToken cancellationToken)
    {
        var configuration = BridgeConfigurationStore.Load();
        return new TlR600VpnDriver(configuration.RouterBaseUri, configuration.RouterUsername, configuration.RouterPassword)
            .OpenAsync(cancellationToken);
    }
}

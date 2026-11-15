using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Principal;
using prismbridge;
using prismshared;

namespace prismbridge.service;

public static class Program
{
    private const string Usage = """
        Family Prism Router Bridge

          prismbridge setup          Register with the server and save the router login (run as administrator)
          prismbridge router-login   Change the router username or password; clears a stopped login
          prismbridge check          Sign in to the router, list its MAC filter table, and sign out (changes nothing)
          prismbridge install        Install and start the Windows service from this folder
          prismbridge uninstall      Stop and remove the Windows service (keeps the saved setup)
          prismbridge status         Show the saved setup, without secrets
          prismbridge run            Run in this console instead of as a service
        """;

    public static async Task<int> Main(string[] args)
    {
        var command = args.FirstOrDefault()?.ToLowerInvariant();
        if (command is null || command == "run")
        {
            if (command is null && Environment.UserInteractive && !Microsoft.Extensions.Hosting.WindowsServices.WindowsServiceHelpers.IsWindowsService())
            {
                Console.WriteLine(Usage);
                return 0;
            }

            RunHost(args.Skip(1).ToArray());
            return 0;
        }

        try
        {
            return command switch
            {
                "setup" => await SetupAsync(),
                "router-login" => await RouterLoginAsync(),
                "check" => await CheckAsync(),
                "install" => RequireAdministrator() ?? BridgeServiceInstaller.Install(Environment.ProcessPath!),
                "uninstall" => RequireAdministrator() ?? BridgeServiceInstaller.Uninstall(),
                "status" => Status(),
                _ => PrintUsage()
            };
        }
        catch (Exception exception) when (exception is InvalidOperationException or RouterException or HttpRequestException)
        {
            Console.Error.WriteLine(exception.Message);
            return 1;
        }
    }

    private static void RunHost(string[] args)
    {
        var builder = Host.CreateApplicationBuilder(args);
        builder.Services.AddWindowsService(options => options.ServiceName = BridgeConstants.ServiceName);
        builder.Services.AddHostedService<Worker>();
        builder.Build().Run();
    }

    private static int PrintUsage()
    {
        Console.WriteLine(Usage);
        return 2;
    }

    private static async Task<int> SetupAsync()
    {
        if (RequireAdministrator() is { } denied)
        {
            return denied;
        }

        if (BridgeConfigurationStore.Exists()
            && !ConsolePrompt.Confirm("This PC is already set up as a Router bridge. Register it again"))
        {
            return 1;
        }

        Console.WriteLine("Router");
        var routerAddress = ConsolePrompt.Ask("  Router address", DefaultGateway() ?? "192.168.1.1");
        var (username, password) = await AskRouterLoginAsync(new Uri($"http://{routerAddress}"));

        Console.WriteLine();
        Console.WriteLine("Family Prism server");
        var server = ConsolePrompt.Ask("  Server address (for example https://prism.example.com)");
        var registrationPassword = ConsolePrompt.AskSecret("  Registration password");
        var name = ConsolePrompt.Ask("  Name for this bridge", Environment.MachineName);

        var (serverBaseUrl, registration) = await new BridgeRegistrationClient()
            .RegisterAsync(server, name, registrationPassword, CancellationToken.None);

        BridgeConfigurationStore.Save(new BridgeConfiguration(
            serverBaseUrl,
            registration.BridgeId,
            registration.BridgeName,
            registration.Credential,
            registration.WebsocketPath,
            routerAddress,
            username,
            password));
        FileLoginBlockStore.Default.Clear();

        Console.WriteLine();
        Console.WriteLine($"Registered as {registration.BridgeName}. Devices now shows in the console.");
        Console.WriteLine("Next: run 'prismbridge install' to start the service.");
        return 0;
    }

    private static async Task<int> RouterLoginAsync()
    {
        if (RequireAdministrator() is { } denied)
        {
            return denied;
        }

        var configuration = BridgeConfigurationStore.Load();
        var (username, password) = await AskRouterLoginAsync(configuration.RouterBaseUri, configuration.RouterUsername);
        BridgeConfigurationStore.Save(configuration with { RouterUsername = username, RouterPassword = password });
        FileLoginBlockStore.Default.Clear();
        Console.WriteLine("Saved. If the service is running, it uses the new login on its next pass (within a few minutes).");
        return 0;
    }

    /// <summary>Tries the login once before saving it. Each failure counts toward the router's lockout.</summary>
    private static async Task<(string Username, string Password)> AskRouterLoginAsync(Uri routerUri, string defaultUsername = "admin")
    {
        var username = ConsolePrompt.Ask("  Router admin username", defaultUsername);
        var password = ConsolePrompt.AskSecret("  Router admin password");
        Console.Write("  Signing in to the router... ");
        var driver = new TlR600VpnDriver(routerUri, username, password);
        await using (var session = await driver.OpenAsync(CancellationToken.None))
        {
            var table = await session.ReadTableAsync(CancellationToken.None);
            Console.WriteLine($"OK, {table.Entries.Count} of {table.MaxRules} filter entries in use.");
        }

        return (username, password);
    }

    private static async Task<int> CheckAsync()
    {
        var configuration = BridgeConfigurationStore.Load();
        if (FileLoginBlockStore.Default.Current is { } blocked)
        {
            Console.WriteLine($"The service stopped signing in to the router: {blocked.Message}");
            Console.WriteLine("Run 'prismbridge router-login' to fix the login.");
            return 1;
        }

        var driver = new TlR600VpnDriver(configuration.RouterBaseUri, configuration.RouterUsername, configuration.RouterPassword);
        await using var session = await driver.OpenAsync(CancellationToken.None);
        var table = await session.ReadTableAsync(CancellationToken.None);
        var own = LocalMacAddresses.Get();
        Console.WriteLine($"{driver.Model} at {configuration.RouterBaseUri}: {table.Entries.Count} of {table.MaxRules} entries.");
        foreach (var (entry, index) in table.Entries.Select((entry, index) => (entry, index)))
        {
            Console.WriteLine($"  [{index}] {entry.Mac}  {entry.Name}");
        }

        Console.WriteLine($"Protected (never blocked): this PC {string.Join(", ", own)}; router admin PC {table.HostMac ?? "unknown"}.");
        return 0;
    }

    private static int Status()
    {
        if (!BridgeConfigurationStore.Exists())
        {
            Console.WriteLine("Not set up. Run 'prismbridge setup' as administrator.");
            return 1;
        }

        var configuration = BridgeConfigurationStore.Load();
        var state = DesiredStateStore.Default.Load();
        Console.WriteLine($"Bridge:   {configuration.BridgeName} ({configuration.BridgeId})");
        Console.WriteLine($"Server:   {configuration.ServerBaseUrl}");
        Console.WriteLine($"Router:   {configuration.RouterBaseUri} as {configuration.RouterUsername}");
        Console.WriteLine($"Devices:  {state.Devices.Count} in the last desired state"
            + (state.ReceivedAtUtc > DateTimeOffset.MinValue ? $" (received {state.ReceivedAtUtc.ToLocalTime():g})" : string.Empty));
        Console.WriteLine($"Service:  {(BridgeServiceInstaller.IsInstalled() ? "installed" : "not installed")}");
        if (FileLoginBlockStore.Default.Current is { } blocked)
        {
            Console.WriteLine($"Stopped:  {blocked.Message} Run 'prismbridge router-login'.");
        }

        return 0;
    }

    /// <summary>Release builds keep their setup in a SYSTEM-only folder, so changing it needs elevation.</summary>
    private static int? RequireAdministrator()
    {
        if (!PrismBuildMode.UsesMachineScope)
        {
            return null;
        }

        using var identity = WindowsIdentity.GetCurrent();
        if (new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))
        {
            return null;
        }

        Console.Error.WriteLine("Run this from an administrator command prompt.");
        return 1;
    }

    private static string? DefaultGateway() =>
        NetworkInterface.GetAllNetworkInterfaces()
            .Where(nic => nic.OperationalStatus == OperationalStatus.Up)
            .SelectMany(nic => nic.GetIPProperties().GatewayAddresses)
            .Select(gateway => gateway.Address)
            .FirstOrDefault(address => address.AddressFamily == AddressFamily.InterNetwork && !address.Equals(System.Net.IPAddress.Any))
            ?.ToString();
}

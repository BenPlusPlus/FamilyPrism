namespace prismsvc;

public class Program
{
    public static void Main(string[] args)
    {
        var builder = Host.CreateApplicationBuilder(args);

        builder.Services.AddWindowsService(options =>
        {
            options.ServiceName = "Family Prism Service";
        });

        builder.Services.AddHostedService<Worker>();

        var host = builder.Build();
        host.Run();
    }
}

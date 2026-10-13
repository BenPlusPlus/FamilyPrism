using prismshared;

namespace prismupdate;

internal static class Program
{
    private static int Main(string[] args)
    {
        try
        {
            return ClientUpdateHelper.RunFromCommandLine(args);
        }
        catch (Exception ex)
        {
            try
            {
                var logPath = Path.Combine(PrismPaths.UpdatesDirectory, "prismupdate.log");
                Directory.CreateDirectory(Path.GetDirectoryName(logPath)!);
                File.AppendAllText(logPath, $"{DateTimeOffset.UtcNow:o} {ex}{Environment.NewLine}");
            }
            catch
            {
            }

            return 1;
        }
    }
}

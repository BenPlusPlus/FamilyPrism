using System.IO.Compression;
using System.Security.Cryptography;

namespace prismshared;

public static class ClientUpdateStager
{
    public static ClientUpdateStageResult Stage(string zipPath, string expectedSha256, string stagingDirectory)
    {
        var actualSha256 = ComputeSha256Hex(zipPath);
        if (!actualSha256.Equals(expectedSha256.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            TryDeleteFile(zipPath);
            TryDeleteDirectory(stagingDirectory);
            return new ClientUpdateStageResult.HashMismatch();
        }

        TryDeleteDirectory(stagingDirectory);
        Directory.CreateDirectory(stagingDirectory);
        ZipFile.ExtractToDirectory(zipPath, stagingDirectory, overwriteFiles: true);
        return new ClientUpdateStageResult.Ready();
    }

    public static string ComputeSha256Hex(string filePath)
    {
        using var stream = File.OpenRead(filePath);
        return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }

    private static void TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
        }
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch
        {
        }
    }
}

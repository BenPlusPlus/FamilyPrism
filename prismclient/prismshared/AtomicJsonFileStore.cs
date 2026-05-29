using System.Text.Json;

namespace prismshared;

internal static class AtomicJsonFileStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public static T? Read<T>(string path)
    {
        if (!File.Exists(path))
        {
            return default;
        }

        var json = File.ReadAllText(path);
        return JsonSerializer.Deserialize<T>(json, JsonOptions);
    }

    public static void Write<T>(string path, T value)
    {
        var directoryPath = Path.GetDirectoryName(path)
            ?? throw new InvalidOperationException($"Unable to determine the parent directory for '{path}'.");

        Directory.CreateDirectory(directoryPath);

        var tempPath = Path.Combine(
            directoryPath,
            $"{Path.GetFileName(path)}.{Guid.NewGuid():N}.tmp");

        var json = JsonSerializer.Serialize(value, JsonOptions);
        File.WriteAllText(tempPath, json);

        if (File.Exists(path))
        {
            File.Replace(tempPath, path, null);
            return;
        }

        File.Move(tempPath, path);
    }
}

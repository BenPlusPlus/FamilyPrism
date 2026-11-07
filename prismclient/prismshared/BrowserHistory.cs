using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace prismshared;

internal sealed record BrowserHistoryDatabase(string Browser, string BrowserProfile, string Path);

internal sealed record ParsedVisit(long VisitId, DateTimeOffset VisitedAt, string Url, string Title);

internal static class BrowserHistory
{
    private const int ChromiumSourceBrowsed = 1;

    public static IReadOnlyList<BrowserHistoryDatabase> FindDatabases(string windowsProfileRoot)
    {
        var results = new List<BrowserHistoryDatabase>();
        AddChromium(
            results,
            Path.Combine(windowsProfileRoot, "AppData", "Local", "Google", "Chrome", "User Data"),
            "Chrome");
        AddChromium(
            results,
            Path.Combine(windowsProfileRoot, "AppData", "Local", "Microsoft", "Edge", "User Data"),
            "Edge");
        AddFirefox(
            results,
            Path.Combine(windowsProfileRoot, "AppData", "Roaming", "Mozilla", "Firefox"));
        return results;
    }

    public static string CopyToTemp(string sourcePath)
    {
        var tempDir = Directory.CreateDirectory(
            Path.Combine(Path.GetTempPath(), "FamilyPrismVisits", Guid.NewGuid().ToString("N")));
        var destPath = Path.Combine(tempDir.FullName, Path.GetFileName(sourcePath));
        CopyShared(sourcePath, destPath);
        foreach (var suffix in new[] { "-wal", "-shm" })
        {
            var sidecar = sourcePath + suffix;
            if (File.Exists(sidecar))
            {
                CopyShared(sidecar, destPath + suffix);
            }
        }

        return destPath;
    }

    public static void DeleteTempCopy(string copiedPath)
    {
        var directory = Path.GetDirectoryName(copiedPath);
        if (string.IsNullOrWhiteSpace(directory) || !Directory.Exists(directory))
        {
            return;
        }

        Directory.Delete(directory, recursive: true);
    }

    public static long ReadMaxVisitId(string databasePath)
    {
        using var connection = Open(databasePath);
        if (TableExists(connection, "visits"))
        {
            return ScalarLong(connection, "SELECT IFNULL(MAX(id), 0) FROM visits");
        }

        if (TableExists(connection, "moz_historyvisits"))
        {
            return ScalarLong(connection, "SELECT IFNULL(MAX(id), 0) FROM moz_historyvisits");
        }

        return 0;
    }

    public static IReadOnlyList<ParsedVisit> ReadLocalVisits(string databasePath, long afterVisitId)
    {
        using var connection = Open(databasePath);
        if (TableExists(connection, "visits") && TableExists(connection, "urls"))
        {
            return ReadChromium(connection, afterVisitId);
        }

        if (TableExists(connection, "moz_historyvisits") && TableExists(connection, "moz_places"))
        {
            return ReadFirefox(connection, afterVisitId);
        }

        return [];
    }

    public static bool IsCollectedUrl(string url)
    {
        return Uri.TryCreate(url, UriKind.Absolute, out var uri)
            && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
    }

    private static void AddChromium(List<BrowserHistoryDatabase> results, string userDataRoot, string browser)
    {
        if (!Directory.Exists(userDataRoot))
        {
            return;
        }

        var skipped = LoadSkippedChromiumProfiles(userDataRoot);
        foreach (var profileDir in Directory.EnumerateDirectories(userDataRoot))
        {
            var profileName = Path.GetFileName(profileDir);
            if (skipped.Contains(profileName))
            {
                continue;
            }

            foreach (var fileName in new[] { "History", "Archived History" })
            {
                var path = Path.Combine(profileDir, fileName);
                if (File.Exists(path))
                {
                    results.Add(new BrowserHistoryDatabase(browser, profileName, path));
                }
            }
        }
    }

    private static HashSet<string> LoadSkippedChromiumProfiles(string userDataRoot)
    {
        var skipped = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Guest Profile",
            "System Profile"
        };

        var localStatePath = Path.Combine(userDataRoot, "Local State");
        if (!File.Exists(localStatePath))
        {
            return skipped;
        }

        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(localStatePath));
            if (!document.RootElement.TryGetProperty("profile", out var profile)
                || !profile.TryGetProperty("info_cache", out var cache)
                || cache.ValueKind != JsonValueKind.Object)
            {
                return skipped;
            }

            foreach (var entry in cache.EnumerateObject())
            {
                if (IsTrue(entry.Value, "is_guest") || IsTrue(entry.Value, "is_ephemeral"))
                {
                    skipped.Add(entry.Name);
                }
            }
        }
        catch (JsonException)
        {
        }
        catch (IOException)
        {
        }

        return skipped;
    }

    private static bool IsTrue(JsonElement element, string propertyName)
    {
        return element.TryGetProperty(propertyName, out var value)
            && value.ValueKind == JsonValueKind.True;
    }

    private static void AddFirefox(List<BrowserHistoryDatabase> results, string firefoxRoot)
    {
        var iniPath = Path.Combine(firefoxRoot, "profiles.ini");
        if (!File.Exists(iniPath))
        {
            return;
        }

        string? section = null;
        string? name = null;
        string? path = null;
        var relative = true;

        foreach (var rawLine in File.ReadLines(iniPath))
        {
            var line = rawLine.Trim();
            if (line.Length == 0 || line.StartsWith('#') || line.StartsWith(';'))
            {
                continue;
            }

            if (line.StartsWith('[') && line.EndsWith(']'))
            {
                FlushFirefoxProfile(results, firefoxRoot, section, name, path, relative);
                section = line[1..^1];
                name = null;
                path = null;
                relative = true;
                continue;
            }

            var separator = line.IndexOf('=');
            if (separator < 0)
            {
                continue;
            }

            var key = line[..separator].Trim();
            var value = line[(separator + 1)..].Trim();
            if (key.Equals("Name", StringComparison.OrdinalIgnoreCase))
            {
                name = value;
            }
            else if (key.Equals("Path", StringComparison.OrdinalIgnoreCase))
            {
                path = value;
            }
            else if (key.Equals("IsRelative", StringComparison.OrdinalIgnoreCase))
            {
                relative = value != "0";
            }
        }

        FlushFirefoxProfile(results, firefoxRoot, section, name, path, relative);
    }

    private static void FlushFirefoxProfile(
        List<BrowserHistoryDatabase> results,
        string firefoxRoot,
        string? section,
        string? name,
        string? path,
        bool relative)
    {
        if (section is null
            || !section.StartsWith("Profile", StringComparison.OrdinalIgnoreCase)
            || string.IsNullOrWhiteSpace(path))
        {
            return;
        }

        var profileDir = relative
            ? Path.GetFullPath(Path.Combine(firefoxRoot, path.Replace('/', Path.DirectorySeparatorChar)))
            : path;
        var places = Path.Combine(profileDir, "places.sqlite");
        if (!File.Exists(places))
        {
            return;
        }

        var profileName = string.IsNullOrWhiteSpace(name) ? Path.GetFileName(profileDir) : name.Trim();
        if (profileName.Equals("guest", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        results.Add(new BrowserHistoryDatabase("Firefox", profileName, places));
    }

    private static IReadOnlyList<ParsedVisit> ReadChromium(SqliteConnection connection, long afterVisitId)
    {
        var hasOriginator = ColumnExists(connection, "visits", "originator_cache_guid");
        var hasVisitSource = TableExists(connection, "visit_source");
        var sql = """
            SELECT v.id, v.visit_time, u.url, IFNULL(u.title, '')
            FROM visits v
            INNER JOIN urls u ON u.id = v.url
            """;
        if (hasVisitSource)
        {
            sql += " LEFT JOIN visit_source vs ON vs.id = v.id";
        }

        sql += " WHERE v.id > @afterId AND IFNULL(u.hidden, 0) = 0";
        if (hasVisitSource)
        {
            sql += " AND (vs.source IS NULL OR vs.source = @browsed)";
        }

        if (hasOriginator)
        {
            sql += " AND (v.originator_cache_guid IS NULL OR v.originator_cache_guid = '')";
        }

        sql += " ORDER BY v.id";

        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("@afterId", afterVisitId);
        if (hasVisitSource)
        {
            command.Parameters.AddWithValue("@browsed", ChromiumSourceBrowsed);
        }

        return ReadRows(command, FromChromiumTime);
    }

    private static IReadOnlyList<ParsedVisit> ReadFirefox(SqliteConnection connection, long afterVisitId)
    {
        var hasLocal = ColumnExists(connection, "moz_historyvisits", "is_local");
        var sql = """
            SELECT v.id, v.visit_date, p.url, IFNULL(p.title, '')
            FROM moz_historyvisits v
            INNER JOIN moz_places p ON p.id = v.place_id
            WHERE v.id > @afterId
              AND IFNULL(p.hidden, 0) = 0
            """;
        if (hasLocal)
        {
            sql += " AND IFNULL(v.is_local, 0) != 0";
        }

        sql += " ORDER BY v.id";

        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("@afterId", afterVisitId);
        return ReadRows(command, FromFirefoxTime);
    }

    private static List<ParsedVisit> ReadRows(
        SqliteCommand command,
        Func<long, DateTimeOffset?> toTime)
    {
        var visits = new List<ParsedVisit>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var url = reader.GetString(2);
            if (!IsCollectedUrl(url))
            {
                continue;
            }

            var visitedAt = toTime(reader.GetInt64(1));
            if (visitedAt is null)
            {
                continue;
            }

            visits.Add(new ParsedVisit(
                reader.GetInt64(0),
                visitedAt.Value,
                url,
                reader.IsDBNull(3) ? string.Empty : reader.GetString(3)));
        }

        return visits;
    }

    private static DateTimeOffset? FromChromiumTime(long microseconds)
    {
        try
        {
            var utc = DateTime.FromFileTimeUtc(checked(microseconds * 10));
            return new DateTimeOffset(utc, TimeSpan.Zero);
        }
        catch (ArgumentOutOfRangeException)
        {
            return null;
        }
        catch (OverflowException)
        {
            return null;
        }
    }

    private static DateTimeOffset? FromFirefoxTime(long microseconds)
    {
        try
        {
            return DateTimeOffset.UnixEpoch.AddTicks(checked(microseconds * 10));
        }
        catch (ArgumentOutOfRangeException)
        {
            return null;
        }
        catch (OverflowException)
        {
            return null;
        }
    }

    private static SqliteConnection Open(string databasePath)
    {
        var connection = new SqliteConnection(
            new SqliteConnectionStringBuilder
            {
                DataSource = databasePath,
                Mode = SqliteOpenMode.ReadWrite,
                Pooling = false
            }.ToString());
        connection.Open();
        return connection;
    }

    private static bool TableExists(SqliteConnection connection, string tableName)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = @name";
        command.Parameters.AddWithValue("@name", tableName);
        return command.ExecuteScalar() is not null;
    }

    private static bool ColumnExists(SqliteConnection connection, string tableName, string columnName)
    {
        using var command = connection.CreateCommand();
        command.CommandText = $"SELECT 1 FROM pragma_table_info('{tableName.Replace("'", "''", StringComparison.Ordinal)}') WHERE name = @column";
        command.Parameters.AddWithValue("@column", columnName);
        return command.ExecuteScalar() is not null;
    }

    private static long ScalarLong(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        var value = command.ExecuteScalar();
        return value is null or DBNull ? 0 : Convert.ToInt64(value);
    }

    private static void CopyShared(string sourcePath, string destinationPath)
    {
        using var input = new FileStream(
            sourcePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.ReadWrite | FileShare.Delete);
        using var output = new FileStream(destinationPath, FileMode.Create, FileAccess.Write, FileShare.None);
        input.CopyTo(output);
    }
}

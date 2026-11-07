using System.Net;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using prismshared;

namespace prismshared.tests;

public class VisitCollectorTests
{
    private static readonly DateTimeOffset VisitAt = DateTimeOffset.Parse("2026-11-06T15:30:00Z");

    [Fact]
    public void PersistentChromiumAndFirefoxProfilesAreCollectedAndGuestSystemSkipped()
    {
        using var workspace = new VisitTestWorkspace();
        workspace.WriteLocalState(
            """
            {
              "profile": {
                "info_cache": {
                  "Default": { "name": "Person 1" },
                  "Profile 1": { "name": "School" },
                  "Ephemeral": { "is_ephemeral": true },
                  "Guest Profile": { "is_guest": true }
                }
              }
            }
            """);
        workspace.CreateChromiumHistory("Default", Local("https://default.example/", "Default page"));
        workspace.CreateChromiumHistory("Profile 1", Local("https://school.example/", "School"));
        workspace.CreateChromiumHistory("Guest Profile", Local("https://guest.example/", "Guest"));
        workspace.CreateChromiumHistory("System Profile", Local("https://system.example/", "System"));
        workspace.CreateChromiumHistory("Ephemeral", Local("https://ephemeral.example/", "Temp"));
        workspace.WriteFirefoxProfilesIni(
            """
            [Profile0]
            Name=default-release
            IsRelative=1
            Path=Profiles/abcd.default-release

            [Profile1]
            Name=guest
            IsRelative=1
            Path=Profiles/guest.default

            [Install123]
            Default=Profiles/abcd.default-release
            """);
        workspace.CreateFirefoxPlaces("abcd.default-release", new FirefoxVisit("https://firefox.example/", "Firefox", false, 1));
        workspace.CreateFirefoxPlaces("guest.default", new FirefoxVisit("https://fx-guest.example/", "Guest FX", false, 1));

        var found = BrowserHistory.FindDatabases(workspace.UserProfileRoot);
        Assert.Equal(
            new[]
            {
                ("Chrome", "Default"),
                ("Chrome", "Profile 1"),
                ("Edge", "Default"),
                ("Edge", "Profile 1"),
                ("Firefox", "default-release")
            },
            found.Select(database => (database.Browser, database.BrowserProfile)).OrderBy(item => item.Browser).ThenBy(item => item.BrowserProfile));

        var state = new VisitCollectionState();
        VisitCollector.CollectUsers([("HOUSE\\kid", workspace.UserProfileRoot)], state, logError: null);

        Assert.Equal(
            new[]
            {
                ("Chrome", "Default", "https://default.example/"),
                ("Chrome", "Profile 1", "https://school.example/"),
                ("Edge", "Default", "https://default.example/"),
                ("Edge", "Profile 1", "https://school.example/"),
                ("Firefox", "default-release", "https://firefox.example/")
            },
            state.Pending
                .Select(visit => (visit.Browser, visit.BrowserProfile, visit.Url))
                .OrderBy(item => item.Browser)
                .ThenBy(item => item.BrowserProfile)
                .ToArray());
        Assert.All(state.Pending, visit => Assert.Equal("HOUSE\\kid", visit.WindowsUser));
        Assert.DoesNotContain(state.Pending, visit => visit.Url.Contains("guest", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(state.Pending, visit => visit.Url.Contains("system", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(state.Pending, visit => visit.Url.Contains("ephemeral", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ChromiumSyncedImportedHiddenAndNonHttpRowsAreNotCollected()
    {
        using var workspace = new VisitTestWorkspace();
        workspace.CreateChromiumHistory(
            "Default",
            Local("https://local.example/", "Local"),
            new ChromiumVisit("https://reload.example/", "Reload", false, 1, null, 8),
            new ChromiumVisit("https://implicit-local.example/", "Implicit", false, null, null),
            new ChromiumVisit("https://synced.example/", "Synced source", false, 0, null),
            new ChromiumVisit("https://imported.example/", "Imported", false, 4, null),
            new ChromiumVisit("https://phone.example/", "Other device", false, 1, "other-device"),
            new ChromiumVisit("https://hidden.example/", "Hidden", true, 1, null),
            new ChromiumVisit("chrome://settings/", "Settings", false, 1, null),
            new ChromiumVisit("edge://flags/", "Flags", false, 1, null),
            new ChromiumVisit("about:blank", "About", false, 1, null),
            new ChromiumVisit("chrome-extension://abc/page.html", "Extension", false, 1, null),
            new ChromiumVisit("file:///C:/tmp/page.html", "File", false, 1, null));

        var copy = BrowserHistory.CopyToTemp(workspace.ChromeHistoryPath("Default"));
        try
        {
            var visits = BrowserHistory.ReadLocalVisits(copy, afterVisitId: 0);
            Assert.Equal(
                new[] { "https://local.example/", "https://reload.example/", "https://implicit-local.example/" },
                visits.Select(visit => visit.Url).ToArray());
        }
        finally
        {
            BrowserHistory.DeleteTempCopy(copy);
        }
    }

    [Fact]
    public void FirefoxRemoteHiddenAndNonHttpRowsAreNotCollected()
    {
        using var workspace = new VisitTestWorkspace();
        workspace.WriteFirefoxProfilesIni(
            """
            [Profile0]
            Name=default-release
            IsRelative=1
            Path=Profiles/abcd.default-release
            """);
        workspace.CreateFirefoxPlaces(
            "abcd.default-release",
            new FirefoxVisit("https://local.example/", "Local", false, 1),
            new FirefoxVisit("https://reload.example/", "Reload", false, 1),
            new FirefoxVisit("https://synced.example/", "Synced", false, 0),
            new FirefoxVisit("https://hidden.example/", "Hidden", true, 1),
            new FirefoxVisit("about:config", "About", false, 1),
            new FirefoxVisit("moz-extension://abc/page.html", "Extension", false, 1),
            new FirefoxVisit("file:///C:/tmp/page.html", "File", false, 1));

        var copy = BrowserHistory.CopyToTemp(workspace.FirefoxPlacesPath("abcd.default-release"));
        try
        {
            var visits = BrowserHistory.ReadLocalVisits(copy, afterVisitId: 0);
            Assert.Equal(
                new[] { "https://local.example/", "https://reload.example/" },
                visits.Select(visit => visit.Url).ToArray());
        }
        finally
        {
            BrowserHistory.DeleteTempCopy(copy);
        }
    }

    [Fact]
    public void ChromiumArchivedHistoryIsCollected()
    {
        using var workspace = new VisitTestWorkspace();
        workspace.CreateChromeHistory("Default", Local("https://live.example/", "Live"));
        workspace.CreateChromeArchivedHistory("Default", Local("https://archived.example/", "Archived"));

        var state = new VisitCollectionState();
        VisitCollector.CollectUsers([("kid", workspace.UserProfileRoot)], state, logError: null);

        Assert.Equal(
            new[] { "https://archived.example/", "https://live.example/" },
            state.Pending.Select(visit => visit.Url).OrderBy(url => url, StringComparer.Ordinal).ToArray());
    }

    [Fact]
    public void FirefoxWithoutIsLocalColumnStillCollectsHttpPages()
    {
        using var workspace = new VisitTestWorkspace();
        workspace.WriteFirefoxProfilesIni(
            """
            [Profile0]
            Name=default-release
            IsRelative=1
            Path=Profiles/abcd.default-release
            """);
        workspace.CreateDesktopFirefoxPlaces(
            "abcd.default-release",
            "https://desktop.example/",
            "Desktop");

        var state = new VisitCollectionState();
        VisitCollector.CollectUsers([("kid", workspace.UserProfileRoot)], state, logError: null);

        Assert.Equal("https://desktop.example/", Assert.Single(state.Pending).Url);
    }

    [Fact]
    public void HighWaterMarkSuppressesDuplicatesAndPicksUpNewVisits()
    {
        using var workspace = new VisitTestWorkspace();
        workspace.CreateChromeHistory("Default", Local("https://first.example/", "First"));

        var state = new VisitCollectionState();
        VisitCollector.CollectUsers(
            [("kid", workspace.UserProfileRoot), ("kid", workspace.UserProfileRoot)],
            state,
            logError: null);
        Assert.Single(state.Pending);
        Assert.Equal("https://first.example/", state.Pending[0].Url);

        VisitCollector.CollectUsers([("kid", workspace.UserProfileRoot)], state, logError: null);
        Assert.Single(state.Pending);

        workspace.AppendChromeVisit("Default", "https://second.example/", "Second");
        VisitCollector.CollectUsers([("kid", workspace.UserProfileRoot)], state, logError: null);
        Assert.Equal(
            new[] { "https://first.example/", "https://second.example/" },
            state.Pending.Select(visit => visit.Url).ToArray());
    }

    [Fact]
    public void HistoryIdResetAfterClearQueuesNewVisits()
    {
        using var workspace = new VisitTestWorkspace();
        workspace.CreateChromeHistory(
            "Default",
            Local("https://before.example/", "Before"),
            new ChromiumVisit("https://synced.example/", "Synced", false, 0, null));

        var state = new VisitCollectionState();
        VisitCollector.CollectUsers([("kid", workspace.UserProfileRoot)], state, logError: null);
        Assert.Equal("https://before.example/", Assert.Single(state.Pending).Url);
        state.Pending.Clear();

        workspace.ReplaceChromeHistory("Default", Local("https://after.example/", "After"));
        VisitCollector.CollectUsers([("kid", workspace.UserProfileRoot)], state, logError: null);

        Assert.Equal("https://after.example/", Assert.Single(state.Pending).Url);
    }

    [Fact]
    public async Task FailedUploadLeavesPendingBatchAndSuccessfulUploadClearsIt()
    {
        using var workspace = new VisitTestWorkspace();
        var statePath = Path.Combine(workspace.Root, "visits.json");
        var state = new VisitCollectionState
        {
            Pending =
            [
                new VisitIngestItem("Chrome", "Default", "One", "https://one.example/", VisitAt.ToString("o"), "kid"),
                new VisitIngestItem("Edge", "Default", "Two", "https://two.example/", VisitAt.ToString("o"), "kid")
            ]
        };
        VisitCollectionStore.Save(state, statePath);

        var handler = new VisitHandler { StatusCode = HttpStatusCode.InternalServerError };
        var apiClient = new PrismApiClient(new HttpClient(handler));

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            VisitCollector.UploadPendingAsync(
                state,
                apiClient,
                Configuration(),
                statePath,
                CancellationToken.None));

        Assert.Equal(2, state.Pending.Count);
        Assert.Equal(2, VisitCollectionStore.Load(statePath).Pending.Count);

        handler.StatusCode = HttpStatusCode.OK;
        var uploaded = await VisitCollector.UploadPendingAsync(
            state,
            apiClient,
            Configuration(),
            statePath,
            CancellationToken.None);

        Assert.Equal(2, uploaded);
        Assert.Empty(state.Pending);
        Assert.Empty(VisitCollectionStore.Load(statePath).Pending);
        Assert.Equal(2, handler.RequestCount);
        var payload = handler.LastPayload;
        Assert.NotNull(payload);
        Assert.Equal("Chrome", payload!.RootElement.GetProperty("visits")[0].GetProperty("browser").GetString());
        Assert.Equal("kid", payload.RootElement.GetProperty("visits")[0].GetProperty("windowsUser").GetString());
    }

    [Fact]
    public async Task TickStoresStateUnderConfigPathAndDoesNotRereadAfterHighWater()
    {
        using var workspace = new VisitTestWorkspace();
        workspace.CreateChromeHistory("Default", Local("https://once.example/", "Once"));
        var statePath = Path.Combine(workspace.Root, "Config", "visits.json");
        var handler = new VisitHandler();
        var apiClient = new PrismApiClient(new HttpClient(handler) { BaseAddress = new Uri("https://familyprism.example.test/") });

        await VisitCollector.TickAsync(
            apiClient,
            () => [("kid", workspace.UserProfileRoot)],
            () => true,
            Configuration,
            statePath,
            logInformation: null,
            logError: null,
            CancellationToken.None);

        Assert.True(File.Exists(statePath));
        Assert.Equal(1, handler.RequestCount);
        Assert.Empty(VisitCollectionStore.Load(statePath).Pending);

        await VisitCollector.TickAsync(
            apiClient,
            () => [("kid", workspace.UserProfileRoot)],
            () => true,
            Configuration,
            statePath,
            logInformation: null,
            logError: null,
            CancellationToken.None);

        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public void LockedHistoryIsSkippedWithoutChangingHighWater()
    {
        using var workspace = new VisitTestWorkspace();
        workspace.CreateChromeHistory("Default", Local("https://locked.example/", "Locked"));
        var errors = new List<string>();
        using var exclusive = new FileStream(
            workspace.ChromeHistoryPath("Default"),
            FileMode.Open,
            FileAccess.ReadWrite,
            FileShare.None);

        var state = new VisitCollectionState();
        VisitCollector.CollectUsers(
            [("kid", workspace.UserProfileRoot)],
            state,
            (_, ex) => errors.Add(ex?.Message ?? string.Empty));

        Assert.Empty(state.Pending);
        Assert.Empty(state.Watermarks);
        Assert.NotEmpty(errors);
    }

    [Fact]
    public void PollIntervalIsAboutSixtySeconds()
    {
        Assert.Equal(TimeSpan.FromSeconds(60), VisitCollector.PollInterval);
    }

    private static ChromiumVisit Local(string url, string title) =>
        new(url, title, false, 1, null);

    private static PrismConfiguration Configuration()
    {
        return new PrismConfiguration(
            "https://familyprism.example.test/",
            "client-1",
            "Kitchen PC",
            "pc_secret",
            "/ws");
    }

    private sealed class VisitTestWorkspace : IDisposable
    {
        public VisitTestWorkspace()
        {
            Root = Path.Combine(Path.GetTempPath(), "FamilyPrismVisitTests", Guid.NewGuid().ToString("N"));
            UserProfileRoot = Path.Combine(Root, "User");
            Directory.CreateDirectory(ChromeUserData);
            Directory.CreateDirectory(EdgeUserData);
            Directory.CreateDirectory(FirefoxRoot);
        }

        public string Root { get; }

        public string UserProfileRoot { get; }

        public string ChromeUserData => Path.Combine(UserProfileRoot, "AppData", "Local", "Google", "Chrome", "User Data");

        public string EdgeUserData => Path.Combine(UserProfileRoot, "AppData", "Local", "Microsoft", "Edge", "User Data");

        public string FirefoxRoot => Path.Combine(UserProfileRoot, "AppData", "Roaming", "Mozilla", "Firefox");

        public void WriteLocalState(string json)
        {
            File.WriteAllText(Path.Combine(ChromeUserData, "Local State"), json);
            File.WriteAllText(Path.Combine(EdgeUserData, "Local State"), json);
        }

        public void WriteFirefoxProfilesIni(string contents)
        {
            Directory.CreateDirectory(FirefoxRoot);
            File.WriteAllText(Path.Combine(FirefoxRoot, "profiles.ini"), contents);
        }

        public string ChromeHistoryPath(string profileName) => Path.Combine(ChromeUserData, profileName, "History");

        public string FirefoxPlacesPath(string folderName) =>
            Path.Combine(FirefoxRoot, "Profiles", folderName, "places.sqlite");

        public void CreateChromiumHistory(string profileName, params ChromiumVisit[] visits)
        {
            WriteChromium(Path.Combine(ChromeUserData, profileName, "History"), visits);
            WriteChromium(Path.Combine(EdgeUserData, profileName, "History"), visits);
        }

        public void CreateChromeHistory(string profileName, params ChromiumVisit[] visits)
        {
            WriteChromium(Path.Combine(ChromeUserData, profileName, "History"), visits);
        }

        public void ReplaceChromeHistory(string profileName, params ChromiumVisit[] visits)
        {
            var path = Path.Combine(ChromeUserData, profileName, "History");
            SqliteConnection.ClearAllPools();
            if (File.Exists(path))
            {
                File.Delete(path);
            }

            WriteChromium(path, visits);
        }

        public void CreateChromeArchivedHistory(string profileName, params ChromiumVisit[] visits)
        {
            WriteChromium(Path.Combine(ChromeUserData, profileName, "Archived History"), visits);
        }

        public void CreateDesktopFirefoxPlaces(string folderName, string url, string title)
        {
            var path = FirefoxPlacesPath(folderName);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            using var connection = Open(path);
            Execute(
                connection,
                """
                CREATE TABLE moz_places (
                  id INTEGER PRIMARY KEY,
                  url LONGVARCHAR,
                  title LONGVARCHAR,
                  hidden INTEGER DEFAULT 0 NOT NULL
                );
                CREATE TABLE moz_historyvisits (
                  id INTEGER PRIMARY KEY,
                  from_visit INTEGER,
                  place_id INTEGER,
                  visit_date INTEGER,
                  visit_type INTEGER,
                  session INTEGER
                );
                """);
            using var placeCommand = connection.CreateCommand();
            placeCommand.CommandText = "INSERT INTO moz_places (url, title, hidden) VALUES ($url, $title, 0)";
            placeCommand.Parameters.AddWithValue("$url", url);
            placeCommand.Parameters.AddWithValue("$title", title);
            placeCommand.ExecuteNonQuery();
            using var visitCommand = connection.CreateCommand();
            visitCommand.CommandText =
                "INSERT INTO moz_historyvisits (from_visit, place_id, visit_date, visit_type, session) VALUES (0, 1, $time, 1, 0)";
            visitCommand.Parameters.AddWithValue("$time", ToFirefoxTime(VisitAt));
            visitCommand.ExecuteNonQuery();
        }

        public void AppendChromeVisit(string profileName, string url, string title)
        {
            AppendChromium(Path.Combine(ChromeUserData, profileName, "History"), url, title, hidden: false, source: 1, originator: null);
        }

        public void CreateFirefoxPlaces(string folderName, params FirefoxVisit[] visits)
        {
            var path = FirefoxPlacesPath(folderName);
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            using var connection = Open(path);
            connection.Open();
            Execute(
                connection,
                """
                CREATE TABLE moz_places (
                  id INTEGER PRIMARY KEY,
                  url LONGVARCHAR,
                  title LONGVARCHAR,
                  hidden INTEGER DEFAULT 0 NOT NULL
                );
                CREATE TABLE moz_historyvisits (
                  id INTEGER PRIMARY KEY,
                  from_visit INTEGER,
                  place_id INTEGER,
                  visit_date INTEGER,
                  visit_type INTEGER,
                  session INTEGER,
                  is_local INTEGER NOT NULL DEFAULT 1
                );
                """);
            foreach (var visit in visits)
            {
                InsertFirefox(connection, visit);
            }
        }

        public void Dispose()
        {
            SqliteConnection.ClearAllPools();
            try
            {
                Directory.Delete(Root, recursive: true);
            }
            catch
            {
            }
        }

        private static SqliteConnection Open(string path)
        {
            var connection = new SqliteConnection(
                new SqliteConnectionStringBuilder
                {
                    DataSource = path,
                    Pooling = false
                }.ToString());
            connection.Open();
            return connection;
        }

        private static void WriteChromium(string path, ChromiumVisit[] visits)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            using var connection = Open(path);
            connection.Open();
            Execute(
                connection,
                """
                CREATE TABLE urls (
                  id INTEGER PRIMARY KEY,
                  url TEXT,
                  title TEXT,
                  hidden INTEGER DEFAULT 0
                );
                CREATE TABLE visits (
                  id INTEGER PRIMARY KEY,
                  url INTEGER,
                  visit_time INTEGER,
                  transition INTEGER DEFAULT 0,
                  originator_cache_guid TEXT
                );
                CREATE TABLE visit_source (
                  id INTEGER PRIMARY KEY,
                  source INTEGER NOT NULL
                );
                """);
            foreach (var visit in visits)
            {
                InsertChromium(connection, visit);
            }
        }

        private static void AppendChromium(
            string path,
            string url,
            string title,
            bool hidden,
            int? source,
            string? originator)
        {
            using var connection = Open(path);
            connection.Open();
            InsertChromium(connection, new ChromiumVisit(url, title, hidden, source, originator, 0));
        }

        private static void InsertChromium(SqliteConnection connection, ChromiumVisit visit)
        {
            using var urlCommand = connection.CreateCommand();
            urlCommand.CommandText = "INSERT INTO urls (url, title, hidden) VALUES ($url, $title, $hidden)";
            urlCommand.Parameters.AddWithValue("$url", visit.Url);
            urlCommand.Parameters.AddWithValue("$title", visit.Title);
            urlCommand.Parameters.AddWithValue("$hidden", visit.Hidden ? 1 : 0);
            urlCommand.ExecuteNonQuery();
            long urlId;
            using (var idCommand = connection.CreateCommand())
            {
                idCommand.CommandText = "SELECT last_insert_rowid()";
                urlId = (long)idCommand.ExecuteScalar()!;
            }

            using var visitCommand = connection.CreateCommand();
            visitCommand.CommandText =
                "INSERT INTO visits (url, visit_time, transition, originator_cache_guid) VALUES ($url, $time, $transition, $originator)";
            visitCommand.Parameters.AddWithValue("$url", urlId);
            visitCommand.Parameters.AddWithValue("$time", ToChromiumTime(VisitAt));
            visitCommand.Parameters.AddWithValue("$transition", visit.Transition);
            visitCommand.Parameters.AddWithValue("$originator", (object?)visit.Originator ?? DBNull.Value);
            visitCommand.ExecuteNonQuery();
            long visitId;
            using (var idCommand = connection.CreateCommand())
            {
                idCommand.CommandText = "SELECT last_insert_rowid()";
                visitId = (long)idCommand.ExecuteScalar()!;
            }

            if (visit.Source is int source)
            {
                using var sourceCommand = connection.CreateCommand();
                sourceCommand.CommandText = "INSERT INTO visit_source (id, source) VALUES ($id, $source)";
                sourceCommand.Parameters.AddWithValue("$id", visitId);
                sourceCommand.Parameters.AddWithValue("$source", source);
                sourceCommand.ExecuteNonQuery();
            }
        }

        private static void InsertFirefox(SqliteConnection connection, FirefoxVisit visit)
        {
            using var placeCommand = connection.CreateCommand();
            placeCommand.CommandText = "INSERT INTO moz_places (url, title, hidden) VALUES ($url, $title, $hidden)";
            placeCommand.Parameters.AddWithValue("$url", visit.Url);
            placeCommand.Parameters.AddWithValue("$title", visit.Title);
            placeCommand.Parameters.AddWithValue("$hidden", visit.Hidden ? 1 : 0);
            placeCommand.ExecuteNonQuery();
            long placeId;
            using (var idCommand = connection.CreateCommand())
            {
                idCommand.CommandText = "SELECT last_insert_rowid()";
                placeId = (long)idCommand.ExecuteScalar()!;
            }

            using var visitCommand = connection.CreateCommand();
            visitCommand.CommandText =
                "INSERT INTO moz_historyvisits (from_visit, place_id, visit_date, visit_type, session, is_local) VALUES (0, $place, $time, 1, 0, $local)";
            visitCommand.Parameters.AddWithValue("$place", placeId);
            visitCommand.Parameters.AddWithValue("$time", ToFirefoxTime(VisitAt));
            visitCommand.Parameters.AddWithValue("$local", visit.IsLocal);
            visitCommand.ExecuteNonQuery();
        }

        private static void Execute(SqliteConnection connection, string sql)
        {
            using var command = connection.CreateCommand();
            command.CommandText = sql;
            command.ExecuteNonQuery();
        }

        private static long ToChromiumTime(DateTimeOffset value) => value.UtcDateTime.ToFileTimeUtc() / 10;

        private static long ToFirefoxTime(DateTimeOffset value) => value.ToUnixTimeMilliseconds() * 1000;
    }

    private readonly record struct ChromiumVisit(
        string Url,
        string Title,
        bool Hidden,
        int? Source,
        string? Originator,
        int Transition = 0);

    private readonly record struct FirefoxVisit(
        string Url,
        string Title,
        bool Hidden,
        int IsLocal);

    private sealed class VisitHandler : HttpMessageHandler
    {
        public int RequestCount { get; private set; }

        public JsonDocument? LastPayload { get; private set; }

        public HttpStatusCode StatusCode { get; set; } = HttpStatusCode.OK;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestCount++;
            if (request.Content is not null)
            {
                LastPayload = JsonDocument.Parse(await request.Content.ReadAsStringAsync(cancellationToken));
            }

            return new HttpResponseMessage(StatusCode)
            {
                RequestMessage = request,
                Content = new StringContent(StatusCode == HttpStatusCode.OK ? string.Empty : "upload failed")
            };
        }
    }
}

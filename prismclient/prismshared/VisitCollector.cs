using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

namespace prismshared;

internal static class WindowsUserName
{
    public static string FromIdentityName(string? identityName)
    {
        if (!string.IsNullOrWhiteSpace(identityName))
        {
            var localAccountPrefix = $"{Environment.MachineName}\\";
            return identityName.StartsWith(localAccountPrefix, StringComparison.OrdinalIgnoreCase)
                ? identityName[localAccountPrefix.Length..]
                : identityName;
        }

        if (!string.Equals(
            Environment.UserDomainName,
            Environment.MachineName,
            StringComparison.OrdinalIgnoreCase))
        {
            return $"{Environment.UserDomainName}\\{Environment.UserName}";
        }

        return Environment.UserName;
    }
}

internal static class VisitCollector
{
    public static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(60);

    internal const int MaxBatchSize = 1000;
    private const int MaxBrowserProfileLength = 255;
    private const int MaxTitleLength = 2048;
    private const int MaxUrlLength = 8192;
    private const int MaxWindowsUserLength = 255;

    public static async Task RunAsync(
        PrismApiClient apiClient,
        Action<string>? logInformation,
        Action<string, Exception?>? logError,
        CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(PollInterval);
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await TickAsync(
                    apiClient,
                    ListInteractiveWindowsUsers,
                    MachineConfigurationStore.HasSecureConfiguration,
                    MachineConfigurationStore.Load,
                    PrismPaths.VisitCollectionPath,
                    logInformation,
                    logError,
                    cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logError?.Invoke("Visit collection failed.", ex);
            }

            try
            {
                await timer.WaitForNextTickAsync(cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                return;
            }
        }
    }

    internal static async Task TickAsync(
        PrismApiClient apiClient,
        Func<IReadOnlyList<(string WindowsUser, string ProfileRoot)>> listUsers,
        Func<bool> hasSecureConfiguration,
        Func<PrismConfiguration> loadConfiguration,
        string statePath,
        Action<string>? logInformation,
        Action<string, Exception?>? logError,
        CancellationToken cancellationToken)
    {
        if (!hasSecureConfiguration())
        {
            return;
        }

        var state = VisitCollectionStore.Load(statePath);
        if (state.HistoryCollection == false)
        {
            if (state.Pending.Count > 0)
            {
                state.Pending.Clear();
                VisitCollectionStore.Save(state, statePath);
            }

            return;
        }

        IReadOnlyList<(string WindowsUser, string ProfileRoot)> users;
        try
        {
            users = listUsers();
        }
        catch (Exception ex)
        {
            logError?.Invoke("Interactive sessions could not be listed for Visit collection.", ex);
            users = [];
        }

        CollectUsers(users, state, logError);
        VisitCollectionStore.Save(state, statePath);

        var uploaded = await UploadPendingAsync(
            state,
            apiClient,
            loadConfiguration(),
            statePath,
            cancellationToken);
        if (uploaded > 0)
        {
            logInformation?.Invoke($"Uploaded {uploaded} Visit(s).");
        }
    }

    internal static void CollectUsers(
        IReadOnlyList<(string WindowsUser, string ProfileRoot)> users,
        VisitCollectionState state,
        Action<string, Exception?>? logError)
    {
        var pendingKeys = new HashSet<string>(state.Pending.Select(VisitKey), StringComparer.Ordinal);
        foreach (var (windowsUser, profileRoot) in users)
        {
            IReadOnlyList<BrowserHistoryDatabase> databases;
            try
            {
                databases = BrowserHistory.FindDatabases(profileRoot);
            }
            catch (Exception ex)
            {
                logError?.Invoke($"Browser profiles could not be listed for {windowsUser}.", ex);
                continue;
            }

            foreach (var database in databases)
            {
                try
                {
                    CollectDatabase(windowsUser, database, state, pendingKeys);
                }
                catch (Exception ex)
                {
                    logError?.Invoke(
                        $"History could not be read for {windowsUser} {database.Browser} {database.BrowserProfile}.",
                        ex);
                }
            }
        }
    }

    internal static void SetHistoryCollection(bool enabled, string? path = null)
    {
        var statePath = path ?? PrismPaths.VisitCollectionPath;
        var state = VisitCollectionStore.Load(statePath);
        state.HistoryCollection = enabled;
        if (!enabled)
        {
            state.Pending.Clear();
        }

        VisitCollectionStore.Save(state, statePath);
    }

    internal static async Task<int> UploadPendingAsync(
        VisitCollectionState state,
        PrismApiClient apiClient,
        PrismConfiguration configuration,
        string statePath,
        CancellationToken cancellationToken)
    {
        var uploaded = 0;
        while (state.Pending.Count > 0)
        {
            var take = Math.Min(MaxBatchSize, state.Pending.Count);
            var batch = state.Pending.GetRange(0, take);
            await apiClient.UploadVisitsAsync(configuration, batch, cancellationToken);
            state.Pending.RemoveRange(0, take);
            VisitCollectionStore.Save(state, statePath);
            uploaded += take;
        }

        return uploaded;
    }

    internal static IReadOnlyList<(string WindowsUser, string ProfileRoot)> ListInteractiveWindowsUsers()
    {
        // WTSQueryUserToken is SYSTEM-only.
        if (!PrismBuildMode.UsesMachineScope)
        {
            var profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (string.IsNullOrWhiteSpace(profile))
            {
                return [];
            }

            return [(WindowsUserName.FromIdentityName(WindowsIdentity.GetCurrent()?.Name), profile)];
        }

        if (!Native.WTSEnumerateSessions(IntPtr.Zero, 0, 1, out var sessionInfo, out var count))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error());
        }

        try
        {
            var unique = new Dictionary<string, (string WindowsUser, string ProfileRoot)>(StringComparer.OrdinalIgnoreCase);
            var size = Marshal.SizeOf<Native.WTS_SESSION_INFO>();
            var current = sessionInfo;
            for (var i = 0; i < count; i++)
            {
                var info = Marshal.PtrToStructure<Native.WTS_SESSION_INFO>(current);
                current += size;
                if (info.SessionId == 0 || info.State != Native.WTS_CONNECTSTATE_CLASS.WTSActive)
                {
                    continue;
                }

                if (TryReadSessionUser(info.SessionId, out var sid, out var windowsUser, out var profileRoot)
                    && !unique.ContainsKey(sid))
                {
                    unique[sid] = (windowsUser, profileRoot);
                }
            }

            return unique.Values.ToList();
        }
        finally
        {
            Native.WTSFreeMemory(sessionInfo);
        }
    }

    private static void CollectDatabase(
        string windowsUser,
        BrowserHistoryDatabase database,
        VisitCollectionState state,
        HashSet<string> pendingKeys)
    {
        var watermarkKey = $"{windowsUser}|{database.Browser}|{database.BrowserProfile}|{Path.GetFileName(database.Path)}";
        var lastVisitId = state.Watermarks.GetValueOrDefault(watermarkKey);
        string? copyPath = null;
        try
        {
            copyPath = BrowserHistory.CopyToTemp(database.Path);
            var maxVisitId = BrowserHistory.ReadMaxVisitId(copyPath);
            if (maxVisitId < lastVisitId)
            {
                lastVisitId = 0;
            }

            var parsed = BrowserHistory.ReadLocalVisits(copyPath, lastVisitId);
            foreach (var visit in parsed)
            {
                var item = ToIngestItem(windowsUser, database, visit);
                if (item is null)
                {
                    continue;
                }

                var key = VisitKey(item);
                if (!pendingKeys.Add(key))
                {
                    continue;
                }

                state.Pending.Add(item);
            }

            state.Watermarks[watermarkKey] = maxVisitId;
        }
        finally
        {
            if (copyPath is not null)
            {
                try
                {
                    BrowserHistory.DeleteTempCopy(copyPath);
                }
                catch (IOException)
                {
                }
            }
        }
    }

    private static VisitIngestItem? ToIngestItem(
        string windowsUser,
        BrowserHistoryDatabase database,
        ParsedVisit visit)
    {
        var profile = Truncate(database.BrowserProfile, MaxBrowserProfileLength);
        var url = Truncate(visit.Url, MaxUrlLength);
        var user = Truncate(windowsUser, MaxWindowsUserLength);
        if (string.IsNullOrWhiteSpace(profile) || string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(user))
        {
            return null;
        }

        return new VisitIngestItem(
            database.Browser,
            profile,
            Truncate(visit.Title, MaxTitleLength),
            url,
            visit.VisitedAt.ToUniversalTime().ToString("o"),
            user);
    }

    private static string Truncate(string value, int maxLength)
    {
        return value.Length <= maxLength ? value : value[..maxLength];
    }

    private static string VisitKey(VisitIngestItem visit)
    {
        return string.Join(
            '\0',
            visit.WindowsUser,
            visit.Browser,
            visit.BrowserProfile,
            visit.VisitTime,
            visit.Url);
    }

    private static bool TryReadSessionUser(
        int sessionId,
        out string sid,
        out string windowsUser,
        out string profileRoot)
    {
        sid = string.Empty;
        windowsUser = string.Empty;
        profileRoot = string.Empty;
        var userToken = IntPtr.Zero;
        if (!Native.WTSQueryUserToken((uint)sessionId, out userToken))
        {
            return false;
        }

        try
        {
            using var identity = new WindowsIdentity(userToken);
            var identitySid = identity.User?.Value;
            if (string.IsNullOrWhiteSpace(identitySid) || string.IsNullOrWhiteSpace(identity.Name))
            {
                return false;
            }

            var length = 260;
            var path = new StringBuilder(length);
            if (!Native.GetUserProfileDirectory(userToken, path, ref length))
            {
                path = new StringBuilder(length);
                if (!Native.GetUserProfileDirectory(userToken, path, ref length))
                {
                    return false;
                }
            }

            profileRoot = path.ToString();
            if (string.IsNullOrWhiteSpace(profileRoot) || !Directory.Exists(profileRoot))
            {
                return false;
            }

            sid = identitySid;
            windowsUser = WindowsUserName.FromIdentityName(identity.Name);
            return true;
        }
        catch (IdentityNotMappedException)
        {
            return false;
        }
        catch (ArgumentException)
        {
            return false;
        }
        finally
        {
            Native.CloseHandle(userToken);
        }
    }
}

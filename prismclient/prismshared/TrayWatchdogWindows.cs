using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace prismshared;

internal sealed class WindowsTrayWatchdogPlatform : ITrayWatchdogPlatform
{
    public IReadOnlyList<SessionSnapshot> ListSessions()
    {
        if (!Native.WTSEnumerateSessions(IntPtr.Zero, 0, 1, out var sessionInfo, out var count))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error());
        }

        try
        {
            var results = new List<SessionSnapshot>(count);
            var size = Marshal.SizeOf<Native.WTS_SESSION_INFO>();
            var current = sessionInfo;
            for (var i = 0; i < count; i++)
            {
                var info = Marshal.PtrToStructure<Native.WTS_SESSION_INFO>(current);
                results.Add(new SessionSnapshot(
                    info.SessionId,
                    IsActive: info.State == Native.WTS_CONNECTSTATE_CLASS.WTSActive));
                current += size;
            }

            return results;
        }
        finally
        {
            Native.WTSFreeMemory(sessionInfo);
        }
    }

    public bool HasProcess(int sessionId, string processName)
    {
        var found = false;
        foreach (var process in Process.GetProcessesByName(processName))
        {
            try
            {
                if (!found && process.SessionId == sessionId)
                {
                    found = true;
                }
            }
            catch (InvalidOperationException)
            {
            }
            catch (Win32Exception)
            {
            }
            finally
            {
                process.Dispose();
            }
        }

        return found;
    }

    public bool TryLaunch(int sessionId, string executablePath, out string? error)
    {
        error = null;
        var userToken = IntPtr.Zero;
        var userTokenOpened = false;
        var primaryToken = IntPtr.Zero;
        var environment = IntPtr.Zero;
        var environmentCreated = false;
        var processInfo = default(Native.PROCESS_INFORMATION);
        var processCreated = false;

        try
        {
            if (!Native.WTSQueryUserToken((uint)sessionId, out userToken))
            {
                error = Native.LastErrorMessage("WTSQueryUserToken");
                return false;
            }

            userTokenOpened = true;

            primaryToken = Native.DuplicateLimitedPrimaryToken(userToken);
            if (primaryToken == IntPtr.Zero)
            {
                error = Native.LastErrorMessage("DuplicateTokenEx");
                return false;
            }

            if (Native.CreateEnvironmentBlock(out environment, primaryToken, false))
            {
                environmentCreated = true;
            }
            else
            {
                environment = IntPtr.Zero;
            }

            var startupInfo = new Native.STARTUPINFO
            {
                cb = Marshal.SizeOf<Native.STARTUPINFO>(),
                lpDesktop = TrayWatchdog.DefaultDesktop
            };

            var commandLine = new StringBuilder($"\"{executablePath}\"");
            var workingDirectory = Path.GetDirectoryName(executablePath);
            var creationFlags = Native.CREATE_NEW_CONSOLE;
            if (environmentCreated)
            {
                creationFlags |= Native.CREATE_UNICODE_ENVIRONMENT;
            }

            if (!Native.CreateProcessAsUser(
                primaryToken,
                executablePath,
                commandLine,
                IntPtr.Zero,
                IntPtr.Zero,
                bInheritHandles: false,
                creationFlags,
                environment,
                workingDirectory,
                ref startupInfo,
                out processInfo))
            {
                error = Native.LastErrorMessage("CreateProcessAsUser");
                return false;
            }

            processCreated = true;
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
        finally
        {
            if (processCreated)
            {
                if (processInfo.hThread != IntPtr.Zero)
                {
                    Native.CloseHandle(processInfo.hThread);
                }

                if (processInfo.hProcess != IntPtr.Zero)
                {
                    Native.CloseHandle(processInfo.hProcess);
                }
            }

            if (environmentCreated)
            {
                Native.DestroyEnvironmentBlock(environment);
            }

            if (primaryToken != IntPtr.Zero)
            {
                Native.CloseHandle(primaryToken);
            }

            if (userTokenOpened)
            {
                Native.CloseHandle(userToken);
            }
        }
    }
}

internal static class Native
{
    internal const uint CREATE_UNICODE_ENVIRONMENT = 0x00000400;
    internal const uint CREATE_NEW_CONSOLE = 0x00000010;
    internal const uint MAXIMUM_ALLOWED = 0x02000000;
    internal const int SecurityImpersonation = 2;
    internal const int TokenPrimary = 1;
    internal const int TokenElevationType = 18;
    internal const int TokenLinkedToken = 19;
    internal const int TokenElevationTypeFull = 2;

    internal static string LastErrorMessage(string api)
    {
        var code = Marshal.GetLastWin32Error();
        return $"{api} failed ({code}): {new Win32Exception(code).Message}";
    }

    internal static IntPtr DuplicateLimitedPrimaryToken(IntPtr userToken)
    {
        if (!DuplicateTokenEx(
            userToken,
            MAXIMUM_ALLOWED,
            IntPtr.Zero,
            SecurityImpersonation,
            TokenPrimary,
            out var primary))
        {
            return IntPtr.Zero;
        }

        if (QueryElevationType(primary) != TokenElevationTypeFull
            || !TryGetLinkedToken(primary, out var linked)
            || linked == IntPtr.Zero)
        {
            return primary;
        }

        CloseHandle(primary);
        if (!DuplicateTokenEx(
            linked,
            MAXIMUM_ALLOWED,
            IntPtr.Zero,
            SecurityImpersonation,
            TokenPrimary,
            out var limitedPrimary))
        {
            CloseHandle(linked);
            return IntPtr.Zero;
        }

        CloseHandle(linked);
        return limitedPrimary;
    }

    private static int QueryElevationType(IntPtr token)
    {
        var buffer = Marshal.AllocHGlobal(sizeof(int));
        try
        {
            if (!GetTokenInformation(token, TokenElevationType, buffer, sizeof(int), out _))
            {
                return 0;
            }

            return Marshal.ReadInt32(buffer);
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static bool TryGetLinkedToken(IntPtr token, out IntPtr linked)
    {
        var buffer = Marshal.AllocHGlobal(IntPtr.Size);
        try
        {
            if (!GetTokenInformation(token, TokenLinkedToken, buffer, IntPtr.Size, out _))
            {
                linked = IntPtr.Zero;
                return false;
            }

            linked = Marshal.ReadIntPtr(buffer);
            return linked != IntPtr.Zero;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    [DllImport("wtsapi32.dll", SetLastError = true)]
    internal static extern bool WTSEnumerateSessions(
        IntPtr hServer,
        int reserved,
        int version,
        out IntPtr ppSessionInfo,
        out int pCount);

    [DllImport("wtsapi32.dll")]
    internal static extern void WTSFreeMemory(IntPtr memory);

    [DllImport("wtsapi32.dll", SetLastError = true)]
    internal static extern bool WTSQueryUserToken(uint sessionId, out IntPtr token);

    [DllImport("advapi32.dll", SetLastError = true)]
    internal static extern bool DuplicateTokenEx(
        IntPtr existingToken,
        uint desiredAccess,
        IntPtr tokenAttributes,
        int impersonationLevel,
        int tokenType,
        out IntPtr newToken);

    [DllImport("advapi32.dll", SetLastError = true)]
    internal static extern bool GetTokenInformation(
        IntPtr tokenHandle,
        int tokenInformationClass,
        IntPtr tokenInformation,
        int tokenInformationLength,
        out int returnLength);

    [DllImport("userenv.dll", SetLastError = true)]
    internal static extern bool CreateEnvironmentBlock(out IntPtr environment, IntPtr token, bool inherit);

    [DllImport("userenv.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool DestroyEnvironmentBlock(IntPtr environment);

    [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    internal static extern bool CreateProcessAsUser(
        IntPtr token,
        string applicationName,
        StringBuilder commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        bool bInheritHandles,
        uint creationFlags,
        IntPtr environment,
        string? currentDirectory,
        ref STARTUPINFO startupInfo,
        out PROCESS_INFORMATION processInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    internal static extern bool CloseHandle(IntPtr handle);

    [StructLayout(LayoutKind.Sequential)]
    internal struct WTS_SESSION_INFO
    {
        public int SessionId;
        public IntPtr pWinStationName;
        public WTS_CONNECTSTATE_CLASS State;
    }

    internal enum WTS_CONNECTSTATE_CLASS
    {
        WTSActive,
        WTSConnected,
        WTSConnectQuery,
        WTSShadow,
        WTSDisconnected,
        WTSIdle,
        WTSListen,
        WTSReset,
        WTSDown,
        WTSInit
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    internal struct STARTUPINFO
    {
        public int cb;
        public string? lpReserved;
        public string? lpDesktop;
        public string? lpTitle;
        public int dwX;
        public int dwY;
        public int dwXSize;
        public int dwYSize;
        public int dwXCountChars;
        public int dwYCountChars;
        public int dwFillAttribute;
        public int dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    internal struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public int dwProcessId;
        public int dwThreadId;
    }
}

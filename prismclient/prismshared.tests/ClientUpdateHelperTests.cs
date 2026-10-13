using prismshared;

namespace prismshared.tests;

public class ClientUpdateHelperTests
{
    [Fact]
    public void RollsBackToPreviousWhenTheNewServiceDoesNotReachRunning()
    {
        using var workspace = new UpdateTestWorkspace();
        workspace.WriteInstallFile("marker.txt", "current");
        workspace.WriteInstallFile(Path.Combine("Service", "prismsvc.exe"), "old-service");
        workspace.WriteStagingFile("marker.txt", "updated");
        workspace.WriteStagingFile(Path.Combine("Service", "prismsvc.exe"), "new-service");
        workspace.WriteStagingFile(PrismConstants.UpdateHelperExecutableName, "helper");

        var services = new FakeServiceControl { RunningAfterStart = false };
        var sessions = new RecordingUserSession { UserLoggedOn = true };
        var plan = CreatePlan(workspace);

        var result = ClientUpdateHelper.Apply(
            plan,
            services,
            sessions,
            parentWaitTimeout: TimeSpan.FromMilliseconds(1),
            healthTimeout: TimeSpan.FromMilliseconds(1));

        Assert.Equal(ClientUpdateHelperResult.RolledBack, result);
        Assert.Equal("current", File.ReadAllText(workspace.InstallFile("marker.txt")));
        Assert.Equal("old-service", File.ReadAllText(workspace.InstallFile(Path.Combine("Service", "prismsvc.exe"))));
        Assert.False(File.Exists(workspace.InstallFile(PrismConstants.UpdateHelperExecutableName)));
        Assert.True(services.StartCount >= 2);

        var failedPin = ClientUpdateStateStore.GetFailedPin(ClientUpdateStateStore.Read(workspace.Paths.StatePath));
        Assert.Equal(plan.Version, failedPin?.Version);
        Assert.Equal(plan.Sha256, failedPin?.Sha256);
        Assert.Contains(PrismConstants.AgentProcessName, sessions.Killed);
        Assert.Contains(PrismConstants.LogonTaskName, sessions.TasksRun);
    }

    [Fact]
    public void RestartsTheLogonTaskAfterASuccessfulSwapWhenAUserIsLoggedOn()
    {
        using var workspace = new UpdateTestWorkspace();
        workspace.WriteInstallFile("marker.txt", "current");
        workspace.WriteStagingFile("marker.txt", "updated");
        workspace.WriteStagingFile(PrismConstants.UpdateHelperExecutableName, "helper");

        var services = new FakeServiceControl { RunningAfterStart = true };
        var sessions = new RecordingUserSession { UserLoggedOn = true };

        var result = ClientUpdateHelper.Apply(
            CreatePlan(workspace),
            services,
            sessions,
            parentWaitTimeout: TimeSpan.FromMilliseconds(1),
            healthTimeout: TimeSpan.FromMilliseconds(1));

        Assert.Equal(ClientUpdateHelperResult.Applied, result);
        Assert.Equal("updated", File.ReadAllText(workspace.InstallFile("marker.txt")));
        Assert.Equal("current", File.ReadAllText(Path.Combine(workspace.Paths.PreviousDirectory, "marker.txt")));
        Assert.Contains(PrismConstants.LogonTaskName, sessions.TasksRun);
    }

    [Fact]
    public void SkipsTheTrayRestartWhenNobodyIsLoggedOn()
    {
        using var workspace = new UpdateTestWorkspace();
        workspace.WriteInstallFile("marker.txt", "current");
        workspace.WriteStagingFile("marker.txt", "updated");

        var sessions = new RecordingUserSession { UserLoggedOn = false };
        var result = ClientUpdateHelper.Apply(
            CreatePlan(workspace),
            new FakeServiceControl { RunningAfterStart = true },
            sessions,
            parentWaitTimeout: TimeSpan.FromMilliseconds(1),
            healthTimeout: TimeSpan.FromMilliseconds(1));

        Assert.Equal(ClientUpdateHelperResult.Applied, result);
        Assert.Empty(sessions.TasksRun);
    }

    private static ClientUpdatePlan CreatePlan(UpdateTestWorkspace workspace)
    {
        return new ClientUpdatePlan(
            workspace.Paths.InstallDirectory,
            workspace.Paths.StagingDirectory,
            workspace.Paths.PreviousDirectory,
            workspace.Paths.StatePath,
            PrismConstants.ServiceName,
            PrismConstants.AgentProcessName,
            PrismConstants.LogonTaskName,
            "0.2.0",
            new string('a', 64),
            ParentProcessId: 0);
    }

    private sealed class FakeServiceControl : IWindowsServiceControl
    {
        public bool RunningAfterStart { get; set; }

        public int StartCount { get; private set; }

        public void Start(string serviceName) => StartCount++;

        public bool WaitUntilStopped(string serviceName, TimeSpan timeout) => true;

        public bool WaitUntilRunning(string serviceName, TimeSpan timeout) => RunningAfterStart;

        public bool IsProcessAlive(string processName) => RunningAfterStart;
    }

    private sealed class RecordingUserSession : IUserSession
    {
        public bool UserLoggedOn { get; set; }

        public List<string> Killed { get; } = [];

        public List<string> TasksRun { get; } = [];

        public bool IsUserLoggedOn() => UserLoggedOn;

        public void KillProcess(string processName) => Killed.Add(processName);

        public void RunLogonTask(string taskName) => TasksRun.Add(taskName);
    }
}

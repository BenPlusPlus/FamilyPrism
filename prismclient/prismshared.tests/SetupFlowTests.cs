using prismshared;

namespace prismshared.tests;

public class SetupFlowTests
{
    [Fact]
    public void TrayRunSetupShowsRegistrationEvenWhenPendingSetupWasLeftBehind()
    {
        Assert.False(SetupFlow.ShouldCompletePending(SetupInvocation.TrayMenu, setupIsComplete: true, hasPendingSetup: true));
        Assert.True(SetupFlow.ShouldShowRegistrationForm(SetupInvocation.TrayMenu, setupIsComplete: true, hasPendingSetup: true));
    }

    [Fact]
    public void StartupCompletesPendingOnlyWhenSetupIsStillIncomplete()
    {
        Assert.True(SetupFlow.ShouldCompletePending(SetupInvocation.Startup, setupIsComplete: false, hasPendingSetup: true));
        Assert.False(SetupFlow.ShouldShowRegistrationForm(SetupInvocation.Startup, setupIsComplete: false, hasPendingSetup: true));

        Assert.False(SetupFlow.ShouldCompletePending(SetupInvocation.Startup, setupIsComplete: true, hasPendingSetup: true));
        Assert.False(SetupFlow.ShouldShowRegistrationForm(SetupInvocation.Startup, setupIsComplete: true, hasPendingSetup: true));
    }

    [Fact]
    public void StartupShowsRegistrationWhenSetupHasNotStarted()
    {
        Assert.True(SetupFlow.ShouldShowRegistrationForm(SetupInvocation.Startup, setupIsComplete: false, hasPendingSetup: false));
        Assert.False(SetupFlow.ShouldCompletePending(SetupInvocation.Startup, setupIsComplete: false, hasPendingSetup: false));
    }

    [Fact]
    public void DeleteAllRemovesLeftoverPendingSetupFiles()
    {
        var directory = Path.Combine(Path.GetTempPath(), "FamilyPrismPendingSetupTests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            File.WriteAllText(Path.Combine(directory, "pending-setup-old.json"), "{}");
            File.WriteAllText(Path.Combine(directory, "pending-setup-new.json"), "{}");
            File.WriteAllText(Path.Combine(directory, "unrelated.json"), "{}");

            PendingSetupStore.DeleteAll(directory);

            Assert.False(File.Exists(Path.Combine(directory, "pending-setup-old.json")));
            Assert.False(File.Exists(Path.Combine(directory, "pending-setup-new.json")));
            Assert.True(File.Exists(Path.Combine(directory, "unrelated.json")));
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }
}

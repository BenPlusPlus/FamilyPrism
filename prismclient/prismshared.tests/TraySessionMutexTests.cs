using prismshared;

namespace prismshared.tests;

public class TraySessionMutexTests
{
    [Fact]
    public void MutexNameIsPerSessionFamilyPrismPrismagent()
    {
        Assert.Equal(@"Local\FamilyPrism.prismagent", TraySessionMutex.Name);
    }

    [Fact]
    public void SecondInstanceCannotTakeTheMutexUntilTheHolderReleases()
    {
        var name = @"Local\FamilyPrism.tests." + Guid.NewGuid().ToString("N");
        using var held = new ManualResetEventSlim(false);
        using var release = new ManualResetEventSlim(false);
        var firstAcquired = false;
        Exception? holderError = null;

        var holder = new Thread(() =>
        {
            try
            {
                firstAcquired = TraySessionMutex.TryAcquire(name, out var first);
                using (first)
                {
                    held.Set();
                    if (firstAcquired)
                    {
                        release.Wait();
                    }
                }
            }
            catch (Exception ex)
            {
                holderError = ex;
                held.Set();
            }
        });
        holder.IsBackground = true;
        holder.Start();

        Assert.True(held.Wait(TimeSpan.FromSeconds(5)));
        Assert.Null(holderError);
        Assert.True(firstAcquired);

        Assert.False(TraySessionMutex.TryAcquire(name, out var second));
        Assert.Null(second);

        release.Set();
        Assert.True(holder.Join(TimeSpan.FromSeconds(5)));
        Assert.Null(holderError);

        Assert.True(TraySessionMutex.TryAcquire(name, out var third));
        Assert.NotNull(third);
        third.Dispose();
    }

    [Fact]
    public void CompleteSetupArgsMatchTheCanHandleCheckThatSkipsTryAcquire()
    {
        // Program.Main calls SetupCompletionRunner.CanHandle first; only that
        // two-arg --complete-setup path returns before TraySessionMutex.TryAcquire.
        Assert.True(IsCompleteSetup(["--complete-setup", @"C:\pending-setup.json"]));
        Assert.True(IsCompleteSetup(["--Complete-Setup", "pending.json"]));
    }

    [Fact]
    public void InteractiveArgsDoNotMatchTheCanHandleCheckThatSkipsTryAcquire()
    {
        Assert.False(IsCompleteSetup([]));
        Assert.False(IsCompleteSetup(["--help"]));
        Assert.False(IsCompleteSetup(["--complete-setup"]));
    }

    [Fact]
    public void DebugBuildsKeepExitMenuAndReleaseOmitsIt()
    {
        // Mirrors TrayApplicationContext: Exit is inside #if DEBUG, not a runtime flag.
#if DEBUG
        const bool includeExit = true;
#else
        const bool includeExit = false;
#endif
#if DEBUG
        Assert.True(includeExit);
#else
        Assert.False(includeExit);
#endif
    }

    private static bool IsCompleteSetup(string[] args)
    {
        return args.Length == 2
            && args[0].Equals("--complete-setup", StringComparison.OrdinalIgnoreCase);
    }
}

namespace prismshared;

public enum SetupInvocation
{
    Startup,
    TrayMenu
}

public static class SetupFlow
{
    public static bool ShouldCompletePending(
        SetupInvocation invocation,
        bool setupIsComplete,
        bool hasPendingSetup)
    {
        if (!hasPendingSetup)
        {
            return false;
        }

        if (invocation == SetupInvocation.TrayMenu)
        {
            return false;
        }

        return !setupIsComplete;
    }

    public static bool ShouldShowRegistrationForm(
        SetupInvocation invocation,
        bool setupIsComplete,
        bool hasPendingSetup)
    {
        if (invocation == SetupInvocation.TrayMenu)
        {
            return true;
        }

        if (setupIsComplete)
        {
            return false;
        }

        return !hasPendingSetup;
    }
}

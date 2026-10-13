namespace prismshared;

public static class ClientUpdatePlanner
{
    public const int UnderstoodLayoutGeneration = 1;
    public const string SupportedKind = "zip";

    public static ClientUpdateDecision Decide(
        ClientUpdateEligibility eligibility,
        string localVersion,
        ClientUpdateManifest? manifest,
        ClientUpdatePin? failedPin,
        bool updateInProgress = false)
    {
        if (!eligibility.UsesMachineScope
            || !eligibility.IsWindowsServiceHost
            || !eligibility.BinariesAreInstalledLayout)
        {
            return new ClientUpdateDecision.Skip(ClientUpdateSkipReason.NotEligible);
        }

        if (!eligibility.IsConfigured || eligibility.HasPendingSetup)
        {
            return new ClientUpdateDecision.Skip(ClientUpdateSkipReason.Unconfigured);
        }

        if (updateInProgress)
        {
            return new ClientUpdateDecision.Skip(ClientUpdateSkipReason.AlreadyInProgress);
        }

        var package = manifest?.Package;
        if (package is null
            || string.IsNullOrWhiteSpace(package.Version)
            || string.IsNullOrWhiteSpace(package.Sha256)
            || string.IsNullOrWhiteSpace(package.Url))
        {
            return new ClientUpdateDecision.Skip(ClientUpdateSkipReason.NoPackage);
        }

        if (!string.Equals(package.Kind, SupportedKind, StringComparison.OrdinalIgnoreCase))
        {
            return new ClientUpdateDecision.Skip(ClientUpdateSkipReason.KindNotSupported);
        }

        if (package.LayoutGeneration > UnderstoodLayoutGeneration)
        {
            return new ClientUpdateDecision.Skip(ClientUpdateSkipReason.LayoutGenerationTooNew);
        }

        if (!IsRemoteVersionGreater(localVersion, package.Version))
        {
            return new ClientUpdateDecision.Skip(ClientUpdateSkipReason.VersionNotGreater);
        }

        if (failedPin is not null
            && string.Equals(failedPin.Version, package.Version, StringComparison.OrdinalIgnoreCase)
            && string.Equals(failedPin.Sha256, package.Sha256, StringComparison.OrdinalIgnoreCase))
        {
            return new ClientUpdateDecision.Skip(ClientUpdateSkipReason.FailedPin);
        }

        return new ClientUpdateDecision.Apply(package);
    }

    public static bool IsRemoteVersionGreater(string localVersion, string remoteVersion)
    {
        return TryCompare(localVersion, remoteVersion, out var comparison) && comparison < 0;
    }

    public static bool TryCompare(string left, string right, out int comparison)
    {
        var leftParts = ParseVersionParts(left);
        var rightParts = ParseVersionParts(right);
        if (leftParts is null || rightParts is null)
        {
            comparison = 0;
            return false;
        }

        var length = Math.Max(leftParts.Length, rightParts.Length);
        for (var index = 0; index < length; index++)
        {
            var leftValue = index < leftParts.Length ? leftParts[index] : 0;
            var rightValue = index < rightParts.Length ? rightParts[index] : 0;
            if (leftValue != rightValue)
            {
                comparison = leftValue < rightValue ? -1 : 1;
                return true;
            }
        }

        comparison = 0;
        return true;
    }

    private static int[]? ParseVersionParts(string version)
    {
        var trimmed = version.Trim();
        if (trimmed.Length == 0)
        {
            return null;
        }

        var separatorIndex = trimmed.IndexOfAny(['+', '-']);
        var core = separatorIndex >= 0 ? trimmed[..separatorIndex] : trimmed;
        if (core.Length == 0)
        {
            return null;
        }

        var tokens = core.Split('.');
        var parts = new int[tokens.Length];
        for (var index = 0; index < tokens.Length; index++)
        {
            if (!int.TryParse(tokens[index], out var value) || value < 0)
            {
                return null;
            }

            parts[index] = value;
        }

        return parts;
    }
}

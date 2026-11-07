namespace prismshared;

internal static class DnsProfileNotice
{
    public const string AutomaticProfileName = "Automatic";
    public const string WindowsDefaultProfileName = "Windows default";

    public static string Name(bool resetToDhcp, string? profileName)
    {
        if (resetToDhcp || string.IsNullOrWhiteSpace(profileName))
        {
            return AutomaticProfileName;
        }

        return profileName;
    }

    public static string NameForCommand(ApplyDnsCommand command)
    {
        return Name(command.ResetToDhcp, command.ProfileName);
    }

    public static string NameForStanding(ApplyDnsStanding? standing)
    {
        return standing is null
            ? WindowsDefaultProfileName
            : Name(standing.ResetToDhcp, standing.ProfileName);
    }

    public static string NameForOverlayStanding(DnsOverlayPersistedState state)
    {
        return state.HasStandingProfile
            ? Name(resetToDhcp: false, state.StandingProfileName)
            : AutomaticProfileName;
    }

    public static int WholeMinutes(TimeSpan duration)
    {
        return Math.Max(1, (int)Math.Round(duration.TotalMinutes, MidpointRounding.AwayFromZero));
    }

    public static string Applied(ApplyDnsCommand command, TimeSpan remaining)
    {
        var profileName = NameForCommand(command);
        if (command.ExpiresAt is null)
        {
            return $"Internet profile is now {profileName}.";
        }

        return $"Internet profile is now {profileName}. Will return to {NameForStanding(command.Standing)} in {MinutesPhrase(remaining)}.";
    }

    public static string Extended(ApplyDnsCommand command, TimeSpan added, TimeSpan remaining)
    {
        return $"{NameForCommand(command)} has been extended by {MinutesPhrase(added)}. Will return to {NameForStanding(command.Standing)} in {MinutesPhrase(remaining)}.";
    }

    public static string Restored(DnsOverlayPersistedState state)
    {
        return $"Internet profile is now {NameForOverlayStanding(state)}.";
    }

    private static string MinutesPhrase(TimeSpan duration)
    {
        var minutes = WholeMinutes(duration);
        return minutes == 1 ? "1 minute" : $"{minutes} minutes";
    }
}

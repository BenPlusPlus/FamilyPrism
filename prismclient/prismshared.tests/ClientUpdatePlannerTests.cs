using prismshared;

namespace prismshared.tests;

public class ClientUpdatePlannerTests
{
    private static readonly ClientUpdateEligibility Eligible = new(
        UsesMachineScope: true,
        IsWindowsServiceHost: true,
        BinariesAreInstalledLayout: true,
        IsConfigured: true,
        HasPendingSetup: false);

    private static readonly ClientUpdatePackage NewerZip = Package();

    [Theory]
    [InlineData(false, true, true)]
    [InlineData(true, false, true)]
    [InlineData(true, true, false)]
    public void SkipsDebugPortableAndNonServiceHosts(
        bool usesMachineScope,
        bool isWindowsServiceHost,
        bool binariesAreInstalledLayout)
    {
        var decision = ClientUpdatePlanner.Decide(
            Eligible with
            {
                UsesMachineScope = usesMachineScope,
                IsWindowsServiceHost = isWindowsServiceHost,
                BinariesAreInstalledLayout = binariesAreInstalledLayout
            },
            "0.1.0",
            new ClientUpdateManifest(NewerZip),
            failedPin: null);

        AssertSkip(decision, ClientUpdateSkipReason.NotEligible);
    }

    [Fact]
    public void SkipsUnconfiguredAndPendingSetupMachines()
    {
        AssertSkip(
            ClientUpdatePlanner.Decide(
                Eligible with { IsConfigured = false },
                "0.1.0",
                new ClientUpdateManifest(NewerZip),
                failedPin: null),
            ClientUpdateSkipReason.Unconfigured);

        AssertSkip(
            ClientUpdatePlanner.Decide(
                Eligible with { HasPendingSetup = true },
                "0.1.0",
                new ClientUpdateManifest(NewerZip),
                failedPin: null),
            ClientUpdateSkipReason.Unconfigured);
    }

    [Fact]
    public void SkipsWhenPinnedSemVerIsNotGreater()
    {
        AssertSkip(
            ClientUpdatePlanner.Decide(Eligible, "0.2.0", new ClientUpdateManifest(Package("0.2.0")), null),
            ClientUpdateSkipReason.VersionNotGreater);

        AssertSkip(
            ClientUpdatePlanner.Decide(Eligible, "0.3.0", new ClientUpdateManifest(Package("0.2.0")), null),
            ClientUpdateSkipReason.VersionNotGreater);

        AssertSkip(
            ClientUpdatePlanner.Decide(
                Eligible,
                "0.2.0",
                new ClientUpdateManifest(Package("0.2.0", sha256: new string('b', 64))),
                null),
            ClientUpdateSkipReason.VersionNotGreater);
    }

    [Fact]
    public void SkipsUnknownKindAndNewerLayoutGeneration()
    {
        AssertSkip(
            ClientUpdatePlanner.Decide(
                Eligible,
                "0.1.0",
                new ClientUpdateManifest(Package(kind: "msix")),
                null),
            ClientUpdateSkipReason.KindNotSupported);

        AssertSkip(
            ClientUpdatePlanner.Decide(
                Eligible,
                "0.1.0",
                new ClientUpdateManifest(Package(layoutGeneration: 2)),
                null),
            ClientUpdateSkipReason.LayoutGenerationTooNew);
    }

    [Fact]
    public void SkipsFailedPinUntilThePinChanges()
    {
        var failed = new ClientUpdatePin(NewerZip.Version, NewerZip.Sha256);

        AssertSkip(
            ClientUpdatePlanner.Decide(Eligible, "0.1.0", new ClientUpdateManifest(NewerZip), failed),
            ClientUpdateSkipReason.FailedPin);

        var changedHash = Package(sha256: new string('c', 64));
        var applyHash = Assert.IsType<ClientUpdateDecision.Apply>(
            ClientUpdatePlanner.Decide(Eligible, "0.1.0", new ClientUpdateManifest(changedHash), failed));
        Assert.Equal(changedHash.Sha256, applyHash.Package.Sha256);

        var changedVersion = Package("0.3.0");
        var applyVersion = Assert.IsType<ClientUpdateDecision.Apply>(
            ClientUpdatePlanner.Decide(Eligible, "0.1.0", new ClientUpdateManifest(changedVersion), failed));
        Assert.Equal("0.3.0", applyVersion.Package.Version);
    }

    [Fact]
    public void AppliesWhenPinnedZipIsNewerAndUnderstood()
    {
        var decision = ClientUpdatePlanner.Decide(
            Eligible,
            "0.1.0",
            new ClientUpdateManifest(NewerZip),
            failedPin: null);

        var apply = Assert.IsType<ClientUpdateDecision.Apply>(decision);
        Assert.Equal(NewerZip, apply.Package);
    }

    private static ClientUpdatePackage Package(
        string version = "0.2.0",
        string? sha256 = null,
        string kind = "zip",
        int layoutGeneration = 1)
    {
        return new ClientUpdatePackage(
            kind,
            layoutGeneration,
            sha256 ?? new string('a', 64),
            "https://example.test/FamilyPrism-0.2.0-win-x64.zip",
            version);
    }

    private static void AssertSkip(ClientUpdateDecision decision, ClientUpdateSkipReason reason)
    {
        var skip = Assert.IsType<ClientUpdateDecision.Skip>(decision);
        Assert.Equal(reason, skip.Reason);
    }
}

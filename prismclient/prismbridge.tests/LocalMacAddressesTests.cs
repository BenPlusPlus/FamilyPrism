using System.Net.NetworkInformation;

namespace prismbridge.tests;

public class LocalMacAddressesTests
{
    [Fact]
    public void AnUnpluggedEthernetAdapterIsNotProtectedSoItCanBeBlockedOnAConsole()
    {
        var nics = new[]
        {
            new LocalNic(OperationalStatus.Up, NetworkInterfaceType.Ethernet, [0x10, 0x7C, 0x61, 0x49, 0xC2, 0xE9]),
            new LocalNic(OperationalStatus.Down, NetworkInterfaceType.Ethernet, [0xB6, 0xC3, 0x97, 0xFE, 0x79, 0xF3]),
        };

        var protectedMacs = LocalMacAddresses.From(nics);

        Assert.Equal(["10-7C-61-49-C2-E9"], protectedMacs);
    }

    [Fact]
    public void ThisPcsWifiRadioStaysProtectedWhenItIsDisconnected()
    {
        var nics = new[]
        {
            new LocalNic(OperationalStatus.Down, NetworkInterfaceType.Wireless80211, [0x4C, 0x82, 0xA9, 0xBC, 0xA5, 0xE3]),
        };

        Assert.Equal(["4C-82-A9-BC-A5-E3"], LocalMacAddresses.From(nics));
    }
}

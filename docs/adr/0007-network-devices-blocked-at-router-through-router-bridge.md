# Network devices are blocked at the router through an optional Router bridge

Phones, tablets, and game consoles can't run the Service, so FamilyPrism controls their internet at the household router. A blocked Network device has every one of its MAC addresses in the router's MAC filter table. A device can have several, such as a console's wired and Wi-Fi addresses, and they are blocked and allowed together. The filter runs in blocklist mode: the router discards packets from listed MAC addresses and forwards everything else, whatever IP address the device uses. The server runs on Railway and can't reach the router, so a Router bridge does the work. It is a separate Windows service on an always-on PC on the home network, and it connects out to the server over the websocket as the Service does. It registers with its own credential and is not a Client, though it may run on a PC that is also a Client.

The feature is optional. The console shows Network devices only after a Router bridge has registered, and nothing else in FamilyPrism depends on it. The server knows Network devices by their MAC addresses and never knows the router model. The Router bridge holds the router driver, and the TL-R600VPN v4 is the only one. The router's username and password live only on the Router bridge, protected with DPAPI in a SYSTEM-only Config directory. The server can ask for a Network device to be blocked or allowed and nothing else. The Router bridge doesn't relay arbitrary requests to the router.

The TL-R600VPN has no published API, but its web UI is a JSON API over form posts, so the driver calls it directly without a browser (see [the protocol notes](../router-bridge-tl-r600vpn.md)). The router allows one admin session at a time, so the Router bridge logs in, makes its changes, and logs out within seconds. That keeps it out of the way of a parent using the router's admin page. The router locks the admin out after 9 failed logins, so a failed login stops the Router bridge from trying again until its credentials change. The Router bridge never blocks its own MAC addresses or the router's admin PC (the router's `host_mac`). It never touches filter entries for MAC addresses that FamilyPrism doesn't manage.

Console admins add, rename, adopt, and remove Network devices and manage the Router bridge. Parents can block or allow a Network device, as they can apply an Internet profile to a Client.

## Considered Options

- The server calling the router directly (the router's admin page would have to be forwarded to the internet)
- Router control inside the Service on a chosen Client (the router password and the feature would depend on a family PC that sleeps or gets reinstalled, and every Client would ship code only one uses)
- Allowlist mode (a bug that empties the table would cut off the whole house)
- Access Control rules by IP address (a device with a static or changed address would escape them)
- Driving the router's pages with a headless browser (heavier and slower, and it makes the same JSON calls underneath)

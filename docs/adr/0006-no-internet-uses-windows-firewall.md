# No internet is enforced with Windows Firewall, not DNS

The Service adds an outbound block rule whose remote addresses are everything except the local network (private, link-local, loopback, multicast, broadcast), the FamilyPrism server's addresses, and the PC's DNS and DHCP servers. DNS servers outside the local network get extra block rules for every port but 53, so they stay reachable for DNS only. DNS settings are left alone while No internet is on. Block rules win over allow rules in Windows Firewall, the rules survive reboots, and a Standard user can't change them.

The server runs on Railway, whose shared ingress addresses can change. So the Service looks up the server again every minute and keeps up to the 8 most recent addresses, which keeps it reachable across a move and through failed lookups. Other Railway apps share those addresses and are reachable during No internet. We accept that small leak. The intent (on or off, plus remembered addresses) is saved in `internet-block.json` under the SYSTEM-only Config directory. At Service start the firewall is made to match it, so deleted rules come back and rules left from a crash are removed. If the rules can't be written, No internet stays off and the directive is reported as failed. Applying any other profile writes DNS first and lifts the block only if that worked, so a failure never opens the PC up. The uninstaller deletes the rules by name.

A DNS-only block would miss IPv6 DNS servers from the router (the WMI call the Service uses sets IPv4 only), cached lookups, apps that connect by IP address, and browsers using DNS over HTTPS. It would also cut off the server unless the server's address was pinned. A HOSTS entry can't follow a Railway address change while DNS is dead. Running a DNS server on FamilyPrism needs port 53 on Railway and still misses everything above.

## Considered Options

- DNS pointed at a dead or loopback resolver, plus a HOSTS entry for the server
- FamilyPrism as a DNS server that only answers for itself
- Windows Filtering Platform filters directly (more code; dynamic filters vanish if the Service dies)
- Setting the firewall's default outbound action to Block (global change; other apps' allow rules would open holes)

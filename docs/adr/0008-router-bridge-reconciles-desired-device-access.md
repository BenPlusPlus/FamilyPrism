# The Router bridge keeps the router matched to desired Device access

The server stores the Device access each Network device should have. Standing access is the last indefinite block or allow. A timed change applies a different access until a UTC deadline, using the same presets as the DNS time limit, and then standing access returns. On connect and after every change, the server sends the Router bridge the complete desired state for every Network device. The Router bridge saves it in its Config directory and makes the router match it at start, after each update, when a timed change ends, and every few minutes. Each pass reads the MAC filter table, adds entries for blocked devices that are missing, deletes entries for allowed devices that are present, and reports the result for each Network device. The console then shows what the router actually does, not what was asked.

Fire-and-forget commands would miss a parent editing the router by hand, a router reset, and changes made while the Router bridge was offline. Applying the desired state twice has the same effect as applying it once, so retries are safe. The router deletes entries by position, not by MAC address. So the Router bridge deletes only from a table it read in the same session, and it checks the MAC address at that position first. The router saves MAC filter changes to flash on its own, so blocks survive a router reboot even while the Router bridge is down.

The Router bridge ends timed changes itself, from the saved deadline. A timed allow still ends if the server or the websocket is down at the deadline. ADR 0002 makes the same choice for Clients. The Router bridge runs on a PC that parents control, so it uses the UTC clock without the monotonic guard ADR 0002 needs against a Standard user. If the Router bridge itself is down at the deadline, the device stays as it was until the Router bridge returns, and the console shows the Router bridge as offline.

FamilyPrism's name for a Network device is the source of truth. The router allows only letters, digits, and underscores, up to 50 characters, so the router entry gets a name derived from it. The first pass also reports filter entries for MAC addresses FamilyPrism doesn't manage. A Console admin can adopt those as Network devices, which start with blocked standing access, instead of typing MAC addresses.

## Considered Options

- The server sending add and delete commands as changes happen
- The router's table as the only record (no room for full names or time limits, and FamilyPrism would share the router's 80-entry limit with every hand-made entry)
- The server ending timed changes (fails whenever the websocket is down at the deadline)

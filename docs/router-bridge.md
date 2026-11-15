# Router bridge protocol

How the Router bridge talks to prism-api (see ADR 0007 and ADR 0008). The router side is in [router-bridge-tl-r600vpn.md](router-bridge-tl-r600vpn.md). `prism-api/test/fake-bridge.ts` is a working example of the bridge side, with a pretend router.

## Setting up the bridge PC

The bridge is `prismclient/prismbridge` (logic in `prismbridge.core`). It needs an always-on Windows PC on the home network with the .NET 10 runtime, the same one the Client uses.

```powershell
# On a development machine
dotnet publish prismclient/prismbridge -c Release -r win-x64 --self-contained false -o out/prismbridge

# Copy out/prismbridge to the bridge PC, for example C:\Program Files\FamilyPrism\Bridge, then from an administrator prompt there:
.\prismbridge setup      # signs in to the router once to check the login, then registers with the server
.\prismbridge install    # installs and starts the "Family Prism Router Bridge" service
.\prismbridge check      # optional: lists the router's filter table without changing it
```

The router login and the bridge's server credential are saved with DPAPI (LocalMachine) under `C:\ProgramData\FamilyPrism\Bridge\Config`, which only SYSTEM and Administrators can open. Debug builds use `%LOCALAPPDATA%\FamilyPrism\Debug\Bridge` instead and don't need elevation.

If the console says the router turned down the bridge's password, the bridge has stopped signing in so it can't lock the router. Run `prismbridge router-login` with the new password; the service picks it up on its next pass, within a few minutes. `prismbridge status` shows the saved setup without secrets. To move the bridge to another PC, remove it in Settings › Router bridge, then run `setup` on the new one.

## Registration

`POST /api/bridges/register` with JSON `{ "bridgeName": "...", "registrationPassword": "..." }`. It uses the same registration password as Clients.

| Status | Meaning |
|--------|---------|
| `200` | `{ bridgeId, bridgeName, credential, websocketPath }`. Keep `bridgeId` and `credential` (it starts with `rb_`); the server stores only a hash of the credential. |
| `403` | Wrong registration password. |
| `409` | A Router bridge is already registered. A Console admin removes it in Settings › Router bridge first. |

## Connection

Open a websocket to `websocketPath` (`/ws/bridge`) with these headers:

- `x-bridge-id: <bridgeId>`
- `Authorization: Bearer <credential>`

A bad or missing credential gets `401`. Only the newest connection is kept: the server closes an older one with code `4000`. The server pings every 30 seconds and drops a socket that misses a pong.

## Server to bridge

- `{ "type": "connected", "bridgeId", "name" }`, right after connecting.
- `{ "type": "desired-state", "serverTime", "devices": [...] }`, right after `connected` and after every change in the console. Each device is `{ id, name, macs: ["AA-BB-CC-DD-EE-FF", ...], standing: "blocked" | "allowed", timed: { access, expiresAt } | null }`. The message always lists every device. Save it, and replace what you saved each time.
- `{ "type": "reconcile-now" }`, sent when someone presses Check router.

A device's access right now is `timed.access` until `timed.expiresAt`, and `standing` after that. Use `serverTime` to correct for the bridge PC's clock. End timed changes yourself at the deadline, even while disconnected.

## Bridge to server

- `{ "type": "identify", "version": "0.1.0", "routerModel": "TL-R600VPN v4" }`, once after connecting.
- `{ "type": "reconcile-report", "entries": [...] | null, "deviceErrors": [...], "error": {...} | null }`, after every pass:
  - `entries`: the router's **whole** MAC filter table after the pass, `[{ name, mac }]`. Include entries FamilyPrism doesn't manage. Send `null` (or leave it out) when the table couldn't be read.
  - `deviceErrors`: `[{ deviceId, code, message? }]` for changes that weren't made. `code` is `protected-mac` (the bridge PC's own address, or the router's `host_mac`), `table-full`, or `unexpected`.
  - `error`: `{ code, message? }` when the pass failed. `code` is `unreachable`, `login-failed`, `locked-out`, `router-busy`, or `unexpected`. After `login-failed` or `locked-out`, stop logging in until the router credentials on the bridge change.

Run a pass on connect, on every `desired-state`, on `reconcile-now`, when a timed change ends, and every few minutes. In each pass:

- Make the table match for every MAC address in the desired state: present if the device is blocked right now, absent if it's allowed.
- Never touch entries for MAC addresses that aren't in the desired state.

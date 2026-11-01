# Tray Watchdog

A Standard user must not be able to end the Tray and keep it dead for the rest of the session. Screenshots and on-screen messages then stay available. DNS, the websocket, and auto-update already live in the Service and stay out of this spec.

See `CONTEXT.md` for Tray, Service, Watchdog, Interactive session, Standard user, Windows administrator, and Console admin. Launch mechanism: [ADR 0001](./adr/0001-watchdog-launches-tray-via-createprocessasuser.md).

## In scope

- Installed Release Service (`prismsvc` as a Windows service, machine-scope, Program Files layout).
- Registration is not required. A kill during setup must not leave the PC without a Tray.
- Every active interactive session (console or RDP). One Tray per such session.

## Out of scope

- Stopping, crashing, or tampering with the Service. A Standard user cannot do that without elevation.
- DEBUG and portable runs. They keep Exit and have no Watchdog.
- Hiding the notify icon, the process, or the ONLOGON task.
- New console UI, websocket fields, or status stamps for a missing Tray.
- Replacing the ONLOGON task `Family Prism Agent`. It still starts the Tray at logon and is what auto-update runs after a swap.

## Behaviour

While the Watchdog is armed:

1. On a loop of about 5 seconds, list active interactive sessions. Skip Session 0 and disconnected sessions.
2. In each of those sessions, treat the Tray as present when a `prismagent` process is running there.
3. If it is missing, launch `Program Files\FamilyPrism\prismagent.exe` into that session with CreateProcessAsUser, as that session's user, on the default desktop (`WinSta0\Default`), with the limited token. No extra arguments.
4. Process death is never a reason to back off or give up. A Standard user who kills the Tray in a loop still gets a new one on the next pass.
5. Back off only when the launch API fails (token not ready, session still connecting). Log that on the Service. Try again on a later pass.
6. The loop is independent of the websocket loop. A stuck or disconnected socket must not pause the Watchdog.

The interactive Tray takes a per-session mutex `Local\FamilyPrism.prismagent`. A second instance exits. `--complete-setup` does not take the mutex. While that helper is running, a `prismagent` in the session may cause the Watchdog to skip; it starts the Tray on the next pass after setup exits.

Installed Release Tray has no Exit menu. Any death (Task Manager, crash, leftover Exit from an old build) is relaunched. A Windows administrator who wants the Tray gone stops the Service or uninstalls.

The notify icon and status window stay visible.

Auto-update already stops the Service, swaps binaries, starts the Service, then kills the Tray and runs the ONLOGON task. The mutex is what stops a double start when the Watchdog and that task race. No extra quiet period is required.

## Not a jailbreak

| Action | Result |
| --- | --- |
| End Task on the Tray | Watchdog starts it again within about 5 seconds. |
| Old Exit menu | Same. |
| Disable or delete the ONLOGON task | Watchdog still launches the Tray. First logon without the task is covered once the Service is running. |
| `--complete-setup` in the same session | Watchdog waits until that process exits, then starts the Tray. |
| Stop the Service, uninstall, or delete Program Files | Windows administrator only. |

Killing the Tray never takes down DNS or the live console connection.

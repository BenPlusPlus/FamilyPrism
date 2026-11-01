# Watchdog launches the Tray via CreateProcessAsUser

The Watchdog lives in the Service (Session 0, SYSTEM) and must put the Tray into a user's interactive session. Re-running the ONLOGON task (`schtasks /Run`) is what auto-update already does, but a Standard user can see that task and the Watchdog would fail if it were disabled. The Service therefore launches the Tray with CreateProcessAsUser. The ONLOGON task remains for first logon and for the updater's tray restart; the Watchdog does not depend on it staying enabled.

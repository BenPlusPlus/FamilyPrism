# FamilyPrism

Self-hosted household console for family-owned Windows PCs. The web console talks to software installed on each PC.

## Language

**Client**:
A registered family PC.
_Avoid_: machine (in console copy), device, endpoint, agent (for the PC itself)

**Tray**:
The interactive FamilyPrism process that runs in a signed-in user's Windows session. It owns the notification icon, screenshots, and on-screen messages.
_Avoid_: agent, prismagent (as a spoken name), tray app, tray agent

**Service**:
The FamilyPrism Windows service that runs as SYSTEM in Session 0. It owns the websocket, DNS directives, auto-update, and the Watchdog.
_Avoid_: agent, background agent, prismsvc (as a spoken name)

**Watchdog**:
The Service's keep-alive for the Tray in each active interactive session.
_Avoid_: restarter, babysitter, tray watchdog (as a separate product)

**Interactive session**:
A Windows logon session that is currently active and attached to a desktop a person can see (console or RDP).
_Avoid_: user session (includes disconnected), logon (the event)

**Standard user**:
A Windows account that cannot elevate. This is the actor who can end the Tray.
_Avoid_: regular user, limited user, kid, child (as a privilege)

**Windows administrator**:
A local account that can elevate on the PC.
_Avoid_: admin (alone), parent (as a privilege)

**Console admin**:
A person who signs into the FamilyPrism web console.
_Avoid_: admin (alone) when a Windows account is meant

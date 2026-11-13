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
The FamilyPrism Windows service that runs as SYSTEM in Session 0. It owns the websocket, DNS directives (including the No internet firewall rules), auto-update, and the Watchdog.
_Avoid_: agent, background agent, prismsvc (as a spoken name)

**Watchdog**:
The Service's keep-alive for the Tray in each active interactive session.
_Avoid_: restarter, babysitter, tray watchdog (as a separate product)

**Interactive session**:
A Windows logon session that is currently active and attached to a desktop a person can see (console or RDP).
_Avoid_: user session (includes disconnected), logon (the event)

**Windows user**:
The Windows account signed into an interactive session on a Client. Visits are attributed to this account, the same identity the Client reports as last user.
_Avoid_: user (alone), kid, child, family member (as an identity store)

**Visit**:
A URL a browser on a Client recorded in its history for a Windows user, including which browser stored it.
_Avoid_: browsing log, web activity, telemetry event, machine history

**Browser profile**:
A persistent Chrome, Edge, or Firefox profile under a Windows user. Guest and system profiles are not collected.
_Avoid_: Chrome user (for the profile), account (for the profile)

**History collection**:
Whether a Client uploads Visits. Default is on; a Console admin can turn it off per Client.
_Avoid_: tracking, monitoring, telemetry, browser logging (as the switch name)

**Visit retention**:
How many days the server keeps a Visit, counted from the visit time. Household-wide, 1–365 days, default 30.
_Avoid_: TTL, log expiry, ingest age

**Standard user**:
A Windows account that cannot elevate. This is the actor who can end the Tray.
_Avoid_: regular user, limited user, kid, child (as a privilege)

**Windows administrator**:
A local account that can elevate on the PC.
_Avoid_: admin (alone), parent (as a privilege)

**Console account**:
A person who signs into the FamilyPrism web console. Every Console account is either a Console admin or a Parent.
_Avoid_: user (alone), login

**Console admin**:
A Console account that manages the household: Settings, Internet profiles, Accounts, Groups, History collection, and deleting History or Clients. The first account is always a Console admin, and the last one can't be demoted or removed.
_Avoid_: admin (alone) when a Windows account is meant

**Parent**:
A Console account for day-to-day parental control: it can message, screenshot, and change a Client's Internet profile, and read History, but can't change household settings or delete anything.
_Avoid_: parent (as a Windows privilege), viewer, limited admin

**Console invite**:
A one-time link a Console admin creates to add a Console account with a chosen role. It expires after 7 days; inviting the same email again replaces it.
_Avoid_: signup link, registration (that's for Clients)

**Internet profile**:
What a Console account applies to a Client to control its internet: the built-in No internet, or a DNS profile. The console says Internet profile everywhere; DNS is only shown as server addresses.
_Avoid_: DNS profile (in console copy), internet mode, filter

**DNS profile**:
A named pair of DNS servers (primary IPv4, optional secondary) that a Console admin manages and any Console account can apply to a Client. In the console it is an Internet profile; code keeps the `dns` names.
_Avoid_: DNS server list, resolver config

**No internet**:
The built-in Internet profile. The Service blocks everything except the local network and the FamilyPrism server with Windows Firewall, and leaves DNS alone. It is listed first in the picker, is not stored in `dns_profiles`, and can't be edited or deleted. Its DNS directive kind is `block`.
_Avoid_: zero internet, offline mode, internet block (in console copy), kill switch

**DNS directive**:
An instruction to a Client to apply a DNS profile, apply No internet, or reset to automatic (DHCP).
_Avoid_: DNS command (in product language), DNS policy

**Standing DNS**:
The last indefinite DNS directive on a Client: a profile (including No internet) applied with no time limit, or reset to automatic. If FamilyPrism has never issued an indefinite directive, standing DNS is whatever Windows already had.
_Avoid_: original profile, previous profile, default DNS

**DNS overlay**:
An Internet profile in effect on a Client for a limited time, after which standing DNS is restored. An overlay that fails to apply, or that expires before apply, never took effect.
_Avoid_: temporary profile, DNS timeout, DNS session, DNS lease

**DNS time limit**:
The duration of a DNS overlay, chosen from presets of 5, 15, 30, or 60 minutes.
_Avoid_: timeout, TTL, lease

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A technical parent who runs the household's Windows PCs, possibly joined by a second adult admin. They use the console in two ways: quick check-ins (is the kids' PC online, what is on its screen, send a message) and occasional setup work (register machines, organize groups, define DNS profiles, watch client versions). Usage is split evenly between a desktop browser and a phone, so every task must work well on a phone.

## Product Purpose

FamilyPrism keeps a live WebSocket connection to each family PC through the Prism agent (a Windows service plus a tray app). From the web console, an admin can see which machines are online and who last used them, push a text message to a screen or group, request a fresh screenshot, apply or reset DNS resolver profiles, and confirm that each client runs the pinned client version. Success means the admin can answer "what is happening on our computers right now?" and act on the answer in seconds.

## Positioning

It is a self-hosted tool that one technical parent built for their own family, not a commercial parental-control suite. It offers direct, transparent control over machines the family owns, with no cloud vendor in between.

## Operating Context

- The server is prism-api (Remix 3, server-rendered, PostgreSQL, Better Auth). Clients are the prismclient C# agent and installer.
- Admin routes: dashboard, clients list, client detail (screenshot, DNS directive, version), groups, settings / DNS profiles, sign in, and first-admin setup.
- Actions are plain HTML form posts that redirect back with a success or error notice.
- Messages are delivered live only. Offline clients do not receive them (v1). DNS directives are queued until the next connection.

## Capabilities and Constraints

- Client states: connected or offline; version current, stale, or unknown; last user; last screenshot time.
- Messages are limited to 500 characters. Group messages report how many clients got them live.
- Deleting a client revokes its credential and cannot be undone.
- DNS profiles hold a primary IPv4 address and an optional secondary. Applying a profile snapshots it, so later edits do not rewrite issued commands.
- Terminology: "client" means a registered PC, "group" is a named set of clients, "DNS profile" and "DNS directive" are as above, and "admin" is a console user.

## Evidence on Hand

There is no logo or brand asset. The only identity commitment is the product name "Prism" / "FamilyPrism". Real data comes only from the running database, so never fabricate machine counts or activity.

## Product Principles

1. Live state comes first: the console exists to show what is true right now and to make stale or offline states obvious.
2. Quick check-ins on a phone are a first-class use, not a shrunken desktop.
3. Destructive and remote-impact actions (delete client, change DNS) must be deliberate and clearly labeled.
4. Use plain, household-scale language and describe actions in real terms. Do not borrow enterprise MDM jargon.

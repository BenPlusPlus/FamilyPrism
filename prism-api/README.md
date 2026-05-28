# Prism API

Prism API is a Remix 3 application that lets admin users manage WebSocket-connected clients. Clients
register once with a shared registration password, receive a permanent credential, and then connect
back over WebSockets so admins can send simple text display messages to an individual client or an
entire group.

## Current capabilities

- Better Auth-backed admin login with PostgreSQL sessions
- first-admin bootstrap flow at `/auth/setup`
- client registration endpoint at `POST /api/clients/register`
- WebSocket client authentication using `x-client-id` plus `Authorization: Bearer <credential>`
- protected admin dashboard, client list, and group management UI
- persisted message and delivery audit records with live-only delivery in v1

## Routes

- `/` — overview and onboarding links
- `/auth/login` — admin login
- `/auth/setup` — first-admin bootstrap
- `/admin` — admin dashboard
- `/admin/clients` — client list and direct messaging
- `/admin/groups` — group creation, membership, and group messaging
- `/api/clients/register` — client registration
- `/ws` — WebSocket upgrade endpoint for registered clients

## Environment

The server expects these environment variables:

| Name                    | Purpose                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`          | PostgreSQL connection string for Better Auth and app tables   |
| `BETTER_AUTH_SECRET`    | Better Auth signing/encryption secret                         |
| `BETTER_AUTH_URL`       | Public base URL for the app, such as `http://localhost:44100` |
| `REGISTRATION_PASSWORD` | Shared password required by client registration               |
| `PORT`                  | Optional HTTP port override; defaults to `44100`              |

## Commands

```sh
pnpm install
pnpm migrate
pnpm start
pnpm test
pnpm typecheck
```

## Client registration

Register a client by posting JSON like:

```json
{
  "clientName": "Lobby Display",
  "registrationPassword": "your-shared-password"
}
```

Successful registration returns the `clientId`, the permanent plaintext `credential`, and the WebSocket
path. The credential is shown only once; the server stores only its hash.

## WebSocket connection

After registration, connect the client to `/ws` with:

- `x-client-id: <clientId>`
- `Authorization: Bearer <credential>`

When an admin sends a message, the server emits JSON in this shape:

```json
{
  "type": "display-message",
  "messageId": "message-id",
  "text": "Hello from Prism"
}
```

## Notes

- Public Better Auth signup is intentionally disabled; the first admin must be created through
  `/auth/setup`.
- v1 is live-delivery only. Offline delivery attempts are recorded, but they are not queued for later
  replay.

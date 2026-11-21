# TL-R600VPN v4 web API (Router bridge driver notes)

Notes for the Router bridge's TL-R600VPN driver (see ADR 0007 and ADR 0008). They come from the router's own web UI JavaScript and a live test against hardware version 4.0, firmware `4.0.3 Build 20190227 Rel.48206`. TP-Link doesn't document any of this, so a firmware change could break it.

## Requests

Every call is a `POST` to `http://<router>/cgi-bin/luci/;stok=<token><path>` with:

- `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`
- `X-Requested-With: XMLHttpRequest` and a `Referer` on the router (for example `http://<router>/webpages/index.html`). Without them the router answers `404 Not Found`.
- After login, the `sysauth` cookie the login response set.
- The body `data=<JSON>`, where the JSON is `{"method": "...", "params": {...}}`.

Replies are JSON served as `text/html`: `{"id":1,"result":...,"others":...,"error_code":"0"}`. `error_code` is a string, and `"0"` means success.

## Login

1. `POST /login?form=login` with an empty token and `{"method":"get","params":{}}`. `result.password` is the RSA public key as `[n, e]`, both hex strings. It is a 1024-bit key with `e = 010001`, and it stays the same across requests.
2. Encrypt the password with **raw RSA and no padding**. The router JavaScript's `nopadding` function puts the password's ASCII bytes at the start of a 128-byte block, fills the rest with zeros, and computes `m^e mod n`. Hex-encode the result and left-pad it with `0` to 256 characters. The router only accepts ASCII passwords of 6–15 characters. Standard PKCS#1 v1.5 padding fails with error `700`.
3. `POST /login?form=login` with `{"method":"login","params":{"username":"...","password":"<hex>"}}`. On success, `result.stok` is the token for later URLs, and the response sets the `sysauth` cookie.

There is no random padding, so the encrypted password is the same on every login and works like the password itself. Never keep or share a capture that includes a login request.

Log out with `POST /admin/system?form=logout` and `{"method":"set"}`.

## Error codes

| Code | Meaning |
|------|---------|
| `700` | Wrong username or password. `result` has `failureCount` and `attemptsAllowed` (9 allowed). |
| `709` | Locked out after too many failed logins. |
| `710` | Another host is logged in. `result` names `logined_user`, `logined_ip`, and so on. (Read from the login page code; not seen in testing.) |
| `704` | The token is no longer valid: logged out, expired, or replaced by a newer login. |

A second login from the **same** host takes over the session, and the earlier token then gets `704`. Sessions time out after a few minutes of inactivity (not measured).

## MAC filter

Mode: `POST /admin/mac_filter?form=mode` with `{"method":"get"}` returns `{"enable":"on","filter_mode":"black","interfaces":["LAN"],"host_mac":"..."}`. `black` is blocklist mode. `host_mac` is the MAC address of the PC using the admin page.

The table is at `POST /admin/mac_filter?form=mac_list`:

- **Read:** `{"method":"get","params":{}}` returns `result: [{"name","mac"}, ...]` and `others.max_rules` (80). MAC addresses come back uppercase and dash-separated. An empty table is `result: {}` (Lua encodes an empty table as an object, not `[]`).
- **Add:** `{"method":"add","params":{"index":<row count>,"old":"add","new":{"name":"...","mac":"AA-BB-CC-DD-EE-FF"},"key":"add"}}` appends a row and returns it in `result`. If you send `name` and `mac` at the top level of `params` instead, nothing is added and no error code comes back.
- **Delete:** `{"method":"delete","params":{"key":"key-<i>","index":"<i>"}}` deletes by **0-based position**. Several positions can be joined with commas. The reply is `result: [{"index":"<i>","success":true}]`.
- **Edit:** `{"method":"set","params":{"index":<i>,"key":"key-<i>","old":{"name","mac"},"new":{"name","mac"}}}` (read from the UI code; not tested).

Names must match `^[A-Za-z0-9_]{1,50}$`. MAC addresses use dashes. The UI rejects multicast and all-zero addresses.

Changes to the table are saved to flash right away. `userconfig?form=cfg_save` reports `"status":"Saved"` after an add or delete, and the admin page's Save button covers only the filter settings above the table.

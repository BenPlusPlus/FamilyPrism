# Windows client release

prism-api auto-deploys from `master` on Railway. The Windows client does not. Installed PCs take a new Tray and Service only when this workflow publishes a GitHub Release and pins it.

## Run a release

1. Merge the client work to `master`.
2. Add repository secrets if they are not already set:
   - `RAILWAY_TOKEN` — a Railway **project** token for production
   - `CLIENT_RELEASE_GITHUB_TOKEN` — a fine-grained PAT on this repo with **Contents** and **Pull requests** read/write. The job opens the version PR as you so `prism-api` runs. A `GITHUB_TOKEN` PR would not start that check.
3. Actions → **Release Windows client** → Run workflow.
4. Use branch `master`. Leave bump on **patch** unless you want minor or major.

The job bumps `prismclient/Directory.Build.props` (and the Inno fallback in `FamilyPrism.iss`) from the **greater** of the version in that props file and the highest existing `vX.Y.Z` tag. It then tests and builds the win-x64 zip and installer. The version files go to `release/client-X.Y.Z` as a PR into `master`. After `prism-api` passes, the job squash-merges that PR, tags the merge commit `vX.Y.Z`, creates the GitHub Release, and sets `CLIENT_PACKAGE_VERSION`, `CLIENT_PACKAGE_URL`, and `CLIENT_PACKAGE_SHA256` on the FamilyPrism Railway service in one call so prism-api redeploys with the new pin.

The default-branch ruleset still requires `prism-api` on every `master` update. The release job does not push `master` directly.

Do not start this from a feature branch. The workflow refuses any ref other than `master`.

## What clients do next

Auto-update applies only when the pin SemVer is **strictly greater** than the installed version. Same version with a new zip hash is a no-op. That is why every run bumps SemVer.

Zip bytes stay on the GitHub Release. Railway only stores the pin. Kind stays `zip` and `layoutGeneration` stays `1` unless you change the zip layout by hand.

## When a PC does not update

- **Check now:** open the tray status window and click **Check for updates**. The service checks right away, ignoring the schedule and any failure backoff, and shows the result under *Last update check*. Restarting the `prismsvc` service does the same.
- **Schedule:** the service checks at startup, on websocket reconnect (at most every 15 minutes), and every 6 hours. A failed check is retried every 15 minutes, doubling up to 6 hours. If the startup check fails (often because the network is not up yet at boot), the first websocket connect runs it again.
- **Logs:** update decisions are written to the Windows Application event log (source `prismsvc`) at Information level. `C:\ProgramData\FamilyPrism\Updates\update-state.json` holds the last failure and backoff, and `prismupdate.log` in the same folder records each install attempt.

## Rollback

Keep the old Release. Point the three `CLIENT_PACKAGE_*` variables at that zip’s version, URL, and SHA-256. Clients still on a newer version will not roll back (greater-than only).

## Local bump check

```powershell
pwsh -NoProfile -File prismclient/bump-client-version.ps1 -SelfTest
```

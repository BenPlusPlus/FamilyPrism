# Visits come from local on-disk browser history

FamilyPrism records Visits by reading Chrome, Edge, and Firefox history databases for each Windows user who has an active interactive session. The Service (SYSTEM) copies those files, diffs new local visits, and uploads batches. High-water marks and unsent batches live under ProgramData Config (SYSTEM/Administrators), so a Standard user cannot delete the queue. We do not install browser extensions, and we do not treat DNS or network traffic as history.

Only rows the browser marked as recorded on this device are uploaded, so Chrome/Edge Sync from a phone does not appear as this Client. Clearing local history does not delete server Visits; the server is append-only until visit retention expires. Chromium’s Archived History is read as well as History so long visit retention can still see older local visits. Extensions would be easy for a Standard user to remove. Screenshots still need the Tray (Session 0 cannot capture the interactive desktop); History files are readable from Session 0, so the Tray stays out of this path.

## Considered Options

- Browser extensions (live navigations, more private-window coverage, install and disable friction)
- Network or DNS hostnames (no full URL, title, or browser)
- Mirroring local deletions onto the server (a Standard user could wipe the console log)
- Uploading every row in the History database, including synced visits from other devices

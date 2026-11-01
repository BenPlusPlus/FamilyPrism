import type { Handle } from "remix/component";

import { routes } from "../../routes.ts";
import { Icon } from "../../ui/icons.tsx";
import { KeyTag, TagChip, type TagClient } from "../../ui/key-tag.tsx";
import { AdminShell } from "../../ui/layout.tsx";
import { NoticeBar } from "../../ui/notice.tsx";
import type { Notice } from "../../utils/notice.ts";

export type RackClient = TagClient & { connected: boolean };

export interface ComposeGroup {
  id: string;
  name: string;
  memberCount: number;
}

function attentionReason(client: RackClient, pinnedVersion: string | null) {
  let reasons: string[] = [];
  if (client.isStale) {
    reasons.push(
      `Running v${client.lastSeenVersion}${pinnedVersion ? `, current is v${pinnedVersion}` : ""}.`,
    );
  } else if (!client.lastSeenVersion) {
    reasons.push("Hasn't reported a client version yet.");
  }
  if (!client.connected) {
    reasons.push("Not connected. Messages sent now won't reach it later.");
  }
  return reasons.join(" ");
}

export function DashboardPage(
  handle: Handle<{
    adminName: string;
    clients: RackClient[];
    groups: ComposeGroup[];
    notice: Notice | null;
    pinnedVersion: string | null;
  }>,
) {
  return () => {
    let { adminName, clients, groups, notice, pinnedVersion } = handle.props;
    let home = clients.filter((client) => client.connected);
    let ordered = [...home, ...clients.filter((client) => !client.connected)];
    let attention = clients.filter(
      (client) => client.isStale || !client.lastSeenVersion || !client.connected,
    );
    let detailHref = (id: string) => routes.admin.clients.detail.href({ clientId: id });

    let headline =
      clients.length === 0
        ? "No PCs on the rack yet"
        : home.length === clients.length
          ? `All ${clients.length} PCs are home`
          : `${home.length} of ${clients.length} PCs are home`;

    return (
      <AdminShell active="home" title="Home" adminName={adminName}>
        <header class="page-head">
          <div>
            <h1>{headline}</h1>
            <p>Connection state as of this page load. Refresh to check again.</p>
          </div>
          <div class="head-actions">
            <a class="btn secondary" href={routes.admin.index.href()}>
              <Icon name="refresh" />
              Refresh
            </a>
          </div>
        </header>

        <NoticeBar notice={notice} />

        <section class="panel rack" aria-labelledby="rack-title">
          <h2 id="rack-title" class="visually-hidden">
            The rack
          </h2>
          {clients.length === 0 ? (
            <div class="rack-empty">
              <strong>Nothing hanging here yet.</strong>
              <p class="muted">
                Install the Prism agent on a family PC and register it with the
                registration password. It appears on the rack as soon as it connects.
              </p>
            </div>
          ) : (
            <div class="rack-row">
              {ordered.map((client) => (
                <div class="hook">
                  <KeyTag client={client} connected={client.connected} href={detailHref(client.id)} />
                </div>
              ))}
            </div>
          )}
        </section>

        <div class="split">
          <section class="panel" aria-labelledby="attention-title">
            <div class="panel-head">
              <h2 id="attention-title">Needs attention</h2>
              <span class="count">{attention.length}</span>
            </div>
            {attention.length === 0 ? (
              <p class="empty">
                <strong>All clear.</strong>
                {clients.length === 0
                  ? "Register a PC to start tracking it here."
                  : "Every PC is home and on the current client version."}
              </p>
            ) : (
              <ul class="rows panel-body">
                {attention.map((client) => (
                  <li>
                    <TagChip client={client} href={detailHref(client.id)} />
                    <span>{attentionReason(client, pinnedVersion)}</span>
                    <span class="row-flags">
                      {client.isStale ? <span class="tape warn">Update due</span> : null}
                      {client.connected ? null : <span class="status away">Offline</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section class="panel" aria-labelledby="compose-title">
            <div class="panel-head">
              <h2 id="compose-title">Quick message</h2>
            </div>
            <form
              class="panel-body"
              method="post"
              action={routes.admin.messages.compose.href()}
            >
              <label class="field">
                <span>Send to</span>
                <select name="target" required disabled={clients.length === 0}>
                  <option value="">Choose a PC or group</option>
                  {groups.length > 0 ? (
                    <optgroup label="Groups">
                      {groups.map((group) => (
                        <option value={`group:${group.id}`}>
                          {group.name} ({group.memberCount}{" "}
                          {group.memberCount === 1 ? "PC" : "PCs"})
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {clients.length > 0 ? (
                    <optgroup label="PCs">
                      {clients.map((client) => (
                        <option value={`client:${client.id}`}>
                          {client.name}
                          {client.connected ? "" : " (offline)"}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              <label class="field">
                <span>Message</span>
                <textarea
                  name="content"
                  rows={3}
                  maxlength={500}
                  required
                  placeholder="Dinner in 10 minutes. Please wrap up."
                  disabled={clients.length === 0}
                ></textarea>
              </label>
              <div class="form-foot">
                <span class="hint">Only PCs that are home get it; messages aren't queued. Up to 500 characters.</span>
                <button class="btn" type="submit" disabled={clients.length === 0}>
                  <Icon name="send" />
                  Send
                </button>
              </div>
            </form>
          </section>
        </div>
      </AdminShell>
    );
  };
}

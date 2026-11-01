import type { Handle } from "remix/component";

import type { listClientsWithGroups } from "../../data/clients.ts";
import type { ClientVersionView } from "../../data/client-package.ts";
import { routes } from "../../routes.ts";
import { Icon } from "../../ui/icons.tsx";
import { TagChip } from "../../ui/key-tag.tsx";
import { AdminShell } from "../../ui/layout.tsx";
import { NoticeBar } from "../../ui/notice.tsx";
import type { Notice } from "../../utils/notice.ts";

export type ClientRow = Awaited<ReturnType<typeof listClientsWithGroups>>[number] &
  ClientVersionView & { connected: boolean };

export function ClientsPage(
  handle: Handle<{
    adminName: string;
    clients: ClientRow[];
    notice: Notice | null;
  }>,
) {
  return () => {
    let { adminName, clients, notice } = handle.props;
    let home = clients.filter((client) => client.connected).length;

    return (
      <AdminShell active="clients" title="Clients" adminName={adminName}>
        <header class="page-head">
          <div>
            <h1>Clients</h1>
            <p>
              {clients.length === 0
                ? "No PCs registered yet."
                : `${clients.length} registered ${clients.length === 1 ? "PC" : "PCs"}, ${home} connected now.`}
            </p>
          </div>
        </header>

        <NoticeBar notice={notice} />

        <section class="panel">
          {clients.length === 0 ? (
            <p class="empty">
              <strong>No PCs registered.</strong>
              Install the Prism agent on a family PC and register it with the registration
              password. It shows up here once registered.
            </p>
          ) : (
            <div class="table-wrap">
              <table class="grid stackable">
                <thead>
                  <tr>
                    <th scope="col">PC</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last user</th>
                    <th scope="col">Version</th>
                    <th scope="col">Groups</th>
                    <th scope="col">
                      <span class="visually-hidden">Details</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => {
                    let href = routes.admin.clients.detail.href({ clientId: client.id });
                    return (
                      <tr>
                        <td>
                          <TagChip client={client} href={href} />
                        </td>
                        <td data-label="Status">
                          <span class={`status ${client.connected ? "home" : "away"}`}>
                            {client.connected ? "Connected" : "Offline"}
                          </span>
                        </td>
                        <td data-label="Last user">{client.last_user ?? <span class="muted">Not reported</span>}</td>
                        <td data-label="Version">
                          {client.lastSeenVersion ? (
                            <span class="data">v{client.lastSeenVersion}</span>
                          ) : (
                            <span class="muted">Unknown</span>
                          )}{" "}
                          {client.isStale ? <span class="tape warn">Update due</span> : null}
                        </td>
                        <td data-label="Groups">
                          {client.groups.length > 0 ? (
                            client.groups.map((group) => group.name).join(", ")
                          ) : (
                            <span class="muted">None</span>
                          )}
                        </td>
                        <td class="go">
                          <a class="row-link" href={href} aria-label={`Open ${client.name}`}>
                            Open
                            <Icon name="chevron" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </AdminShell>
    );
  };
}

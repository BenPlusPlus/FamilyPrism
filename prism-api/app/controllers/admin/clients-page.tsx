import type { Handle } from "remix/ui";

import { listClientsWithGroups } from "../../data/clients.ts";
import { connectionRegistry } from "../../realtime/registry.ts";
import { routes } from "../../routes.ts";
import { Layout } from "../../ui/layout.tsx";
import { getNotice } from "../../utils/notice.ts";
import { renderNotice } from "./notice.tsx";

export function ClientsPage(
  handle: Handle<{
    clients: Awaited<ReturnType<typeof listClientsWithGroups>>;
    notice: ReturnType<typeof getNotice>;
  }>,
) {
  return () => (
    <Layout title="Clients">
      <h1>Clients</h1>
      <p>Send a text message directly to any registered client.</p>
      {handle.props.notice ? renderNotice(handle.props.notice) : null}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Client ID</th>
            <th>Last user</th>
            <th>Status</th>
            <th>Groups</th>
            <th>Details</th>
            <th>Send message</th>
            <th>Unregister</th>
          </tr>
        </thead>
        <tbody>
          {handle.props.clients.map((client) => (
            <tr>
              <td>{client.name}</td>
              <td>
                <code>{client.id}</code>
              </td>
              <td>{client.last_user ?? "—"}</td>
              <td>
                {connectionRegistry.isClientConnected(client.id)
                  ? "Connected"
                  : "Offline"}
              </td>
              <td>
                {client.groups.length > 0
                  ? client.groups.map((group) => group.name).join(", ")
                  : "—"}
              </td>
              <td>
                <a
                  href={routes.admin.clients.detail.href({
                    clientId: client.id,
                  })}
                >
                  View detail
                </a>
              </td>
              <td>
                <form
                  method="post"
                  action={routes.admin.messages.client.href({
                    clientId: client.id,
                  })}
                  class="stack compact"
                >
                  <textarea
                    name="content"
                    rows={3}
                    placeholder="Message for display on the client"
                    required
                  ></textarea>
                  <button type="submit">Send</button>
                </form>
              </td>
              <td>
                <form
                  method="post"
                  action={routes.admin.clients.delete.href({
                    clientId: client.id,
                  })}
                >
                  <button type="submit">Delete client</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  );
}

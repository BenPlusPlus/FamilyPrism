import type { Controller } from "remix/fetch-router";
import { Auth, requireAuth } from "remix/auth-middleware";
import * as s from "remix/data-schema";
import * as f from "remix/data-schema/form-data";
import { maxLength, minLength } from "remix/data-schema/checks";
import { redirect } from "remix/response/redirect";
import type { Handle } from "remix/ui";

import {
  deleteClient,
  listClients,
  listClientsWithGroups,
} from "../../data/clients.ts";
import type { AdminIdentity } from "../../data/auth.ts";
import {
  GroupNameConflictError,
  createGroup,
  listGroups,
  listGroupsWithMembers,
  replaceGroupMembers,
} from "../../data/groups.ts";
import {
  MessageTargetNotFoundError,
  dispatchTextMessageToClient,
  dispatchTextMessageToGroup,
} from "../../data/messages.ts";
import { requireAdmin } from "../../middleware/admin.ts";
import { connectionRegistry } from "../../realtime/registry.ts";
import type { AppContext } from "../../router.ts";
import { routes } from "../../routes.ts";
import { Layout } from "../../ui/layout.tsx";
import { getNotice, withNotice } from "../../utils/notice.ts";
import { render } from "../../utils/render.tsx";

let messageSchema = f.object({
  content: f.field(s.string().pipe(minLength(1), maxLength(500))),
});

let groupSchema = f.object({
  description: f.field(s.string()),
  name: f.field(s.string().pipe(minLength(1), maxLength(100))),
});

function getCurrentAdminIdentity(context: Pick<AppContext, "get">) {
  let auth = context.get(Auth);
  if (!auth.ok || !auth.identity.isAdmin) {
    throw new Error("Expected an authenticated admin identity.");
  }

  return auth.identity as AdminIdentity;
}

export const admin = {
  middleware: [
    requireAuth<AdminIdentity>({
      onFailure() {
        return redirect(routes.auth.login.index.href());
      },
    }),
    requireAdmin(),
  ],
  actions: {
    async index({ get, request }) {
      let identity = getCurrentAdminIdentity({ get });
      let [clientRows, groupRows] = await Promise.all([
        listClients(),
        listGroups(),
      ]);

      return render(
        <DashboardPage
          adminName={identity.user.name}
          clientCount={clientRows.length}
          connectedClientCount={connectionRegistry.countConnectedClients()}
          groupCount={groupRows.length}
          notice={getNotice(new URL(request.url))}
        />,
        request,
      );
    },
  },
} satisfies Controller<typeof routes.admin, AppContext>;

export const adminClients = {
  middleware: [
    requireAuth<AdminIdentity>({
      onFailure() {
        return redirect(routes.auth.login.index.href());
      },
    }),
    requireAdmin(),
  ],
  actions: {
    async index({ request }) {
      let notice = getNotice(new URL(request.url));
      let clientsWithGroups = await listClientsWithGroups();

      return render(
        <ClientsPage clients={clientsWithGroups} notice={notice} />,
        request,
      );
    },

    async delete({ params, request }) {
      let client = await deleteClient(params.clientId);

      if (!client) {
        return redirect(
          withNotice(request, routes.admin.clients.index.href(), {
            text: "Client not found.",
            type: "error",
          }),
        );
      }

      connectionRegistry.disconnectClient(client.id);

      return redirect(
        withNotice(request, routes.admin.clients.index.href(), {
          text: `Deleted ${client.name} and revoked its credentials.`,
          type: "success",
        }),
      );
    },
  },
} satisfies Controller<typeof routes.admin.clients, AppContext>;

export const adminGroups = {
  middleware: [
    requireAuth<AdminIdentity>({
      onFailure() {
        return redirect(routes.auth.login.index.href());
      },
    }),
    requireAdmin(),
  ],
  actions: {
    async index({ request }) {
      let [allClients, groupsWithMembers] = await Promise.all([
        listClients(),
        listGroupsWithMembers(),
      ]);

      return render(
        <GroupsPage
          allClients={allClients}
          groups={groupsWithMembers}
          notice={getNotice(new URL(request.url))}
        />,
        request,
      );
    },

    async create({ get, request }) {
      let parsed = s.parseSafe(groupSchema, get(FormData));
      if (!parsed.success) {
        return redirect(
          withNotice(request, routes.admin.groups.index.href(), {
            text: parsed.issues[0]?.message ?? "Invalid group payload.",
            type: "error",
          }),
        );
      }

      let formData = get(FormData);
      let selectedClientIds = formData.getAll("clientId").map(String);

      try {
        await createGroup({
          clientIds: selectedClientIds,
          description: parsed.value.description,
          name: parsed.value.name,
        });
      } catch (error) {
        if (error instanceof GroupNameConflictError) {
          return redirect(
            withNotice(request, routes.admin.groups.index.href(), {
              text: error.message,
              type: "error",
            }),
          );
        }

        throw error;
      }

      return redirect(
        withNotice(request, routes.admin.groups.index.href(), {
          text: "Group created.",
          type: "success",
        }),
      );
    },

    async members({ get, params, request }) {
      let selectedClientIds = get(FormData).getAll("clientId").map(String);
      let group = await replaceGroupMembers(params.groupId, selectedClientIds);

      if (!group) {
        return redirect(
          withNotice(request, routes.admin.groups.index.href(), {
            text: "Group not found.",
            type: "error",
          }),
        );
      }

      return redirect(
        withNotice(request, routes.admin.groups.index.href(), {
          text: `Updated members for ${group.name}.`,
          type: "success",
        }),
      );
    },
  },
} satisfies Controller<typeof routes.admin.groups, AppContext>;

export const adminMessages = {
  middleware: [
    requireAuth<AdminIdentity>({
      onFailure() {
        return redirect(routes.auth.login.index.href());
      },
    }),
    requireAdmin(),
  ],
  actions: {
    async client({ get, params, request }) {
      let identity = getCurrentAdminIdentity({ get });
      let parsed = s.parseSafe(messageSchema, get(FormData));
      if (!parsed.success) {
        return redirect(
          withNotice(request, routes.admin.clients.index.href(), {
            text: parsed.issues[0]?.message ?? "Message text is required.",
            type: "error",
          }),
        );
      }

      try {
        let result = await dispatchTextMessageToClient({
          clientId: params.clientId,
          content: parsed.value.content,
          senderAdminUserId: identity.user.id,
        });

        return redirect(
          withNotice(request, routes.admin.clients.index.href(), {
            text: `Message sent to 1 client; ${result.deliveredLiveCount} delivered live.`,
            type: "success",
          }),
        );
      } catch (error) {
        if (error instanceof MessageTargetNotFoundError) {
          return redirect(
            withNotice(request, routes.admin.clients.index.href(), {
              text: error.message,
              type: "error",
            }),
          );
        }

        throw error;
      }
    },

    async group({ get, params, request }) {
      let identity = getCurrentAdminIdentity({ get });
      let parsed = s.parseSafe(messageSchema, get(FormData));
      if (!parsed.success) {
        return redirect(
          withNotice(request, routes.admin.groups.index.href(), {
            text: parsed.issues[0]?.message ?? "Message text is required.",
            type: "error",
          }),
        );
      }

      try {
        let result = await dispatchTextMessageToGroup({
          content: parsed.value.content,
          groupId: params.groupId,
          senderAdminUserId: identity.user.id,
        });

        return redirect(
          withNotice(request, routes.admin.groups.index.href(), {
            text: `Group message sent to ${result.targetCount} clients; ${result.deliveredLiveCount} delivered live.`,
            type: "success",
          }),
        );
      } catch (error) {
        if (error instanceof MessageTargetNotFoundError) {
          return redirect(
            withNotice(request, routes.admin.groups.index.href(), {
              text: error.message,
              type: "error",
            }),
          );
        }

        throw error;
      }
    },
  },
} satisfies Controller<typeof routes.admin.messages, AppContext>;

function DashboardPage(
  handle: Handle<{
    adminName: string;
    clientCount: number;
    connectedClientCount: number;
    groupCount: number;
    notice: ReturnType<typeof getNotice>;
  }>,
) {
  return () => (
    <Layout title="Admin dashboard">
      <h1>Admin dashboard</h1>
      <p>Signed in as {handle.props.adminName}.</p>
      {handle.props.notice ? renderNotice(handle.props.notice) : null}
      <div class="card-grid">
        <article class="card">
          <h2>Clients</h2>
          <p>{handle.props.clientCount} total clients</p>
          <p>{handle.props.connectedClientCount} currently connected</p>
          <a href={routes.admin.clients.index.href()}>Manage clients</a>
        </article>
        <article class="card">
          <h2>Groups</h2>
          <p>{handle.props.groupCount} configured groups</p>
          <a href={routes.admin.groups.index.href()}>Manage groups</a>
        </article>
      </div>
    </Layout>
  );
}

function ClientsPage(
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
            <th>Status</th>
            <th>Groups</th>
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

function GroupsPage(
  handle: Handle<{
    allClients: Awaited<ReturnType<typeof listClients>>;
    groups: Awaited<ReturnType<typeof listGroupsWithMembers>>;
    notice: ReturnType<typeof getNotice>;
  }>,
) {
  let groupsCreateAction = routes.admin.groups.create.href();

  return () => (
    <Layout title="Groups">
      <h1>Groups</h1>
      <p>Create groups, manage membership, and send group messages.</p>
      {handle.props.notice ? renderNotice(handle.props.notice) : null}

      <section class="card">
        <h2>Create group</h2>
        <form method="post" action={groupsCreateAction} class="stack">
          <label>
            Name
            <input type="text" name="name" required />
          </label>
          <label>
            Description
            <textarea name="description" rows={2}></textarea>
          </label>
          <fieldset>
            <legend>Initial members</legend>
            <div class="checkbox-grid">
              {handle.props.allClients.map((client) => (
                <label>
                  <input type="checkbox" name="clientId" value={client.id} />{" "}
                  {client.name}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit">Create group</button>
        </form>
      </section>

      <div class="stack">
        {handle.props.groups.map((group) => {
          let memberIds = new Set(group.members.map((member) => member.id));

          return (
            <section class="card">
              <h2>{group.name}</h2>
              <p>{group.description || "No description."}</p>
              <p>
                Members:{" "}
                {group.members.length > 0
                  ? group.members.map((member) => member.name).join(", ")
                  : "None"}
              </p>
              <div class="card-grid">
                <form
                  method="post"
                  action={routes.admin.groups.members.href({
                    groupId: group.id,
                  })}
                  class="stack"
                >
                  <h3>Update membership</h3>
                  <div class="checkbox-grid">
                    {handle.props.allClients.map((client) => (
                      <label>
                        <input
                          type="checkbox"
                          name="clientId"
                          value={client.id}
                          checked={memberIds.has(client.id)}
                        />{" "}
                        {client.name}
                      </label>
                    ))}
                  </div>
                  <button type="submit">Save members</button>
                </form>

                <form
                  method="post"
                  action={routes.admin.messages.group.href({
                    groupId: group.id,
                  })}
                  class="stack"
                >
                  <h3>Send group message</h3>
                  <textarea
                    name="content"
                    rows={4}
                    placeholder="Message for every client in this group"
                    required
                  ></textarea>
                  <button type="submit">Send to group</button>
                </form>
              </div>
            </section>
          );
        })}
      </div>
    </Layout>
  );
}

function renderNotice(notice: NonNullable<ReturnType<typeof getNotice>>) {
  return (
    <div class={`notice ${notice.type}`}>
      <strong>{notice.type === "error" ? "Error" : "Success"}:</strong>{" "}
      {notice.text}
    </div>
  );
}

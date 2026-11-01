import type { Controller } from "remix/fetch-router";
import { Auth, requireAuth } from "remix/auth-middleware";
import * as s from "remix/data-schema";
import * as f from "remix/data-schema/form-data";
import { maxLength, minLength } from "remix/data-schema/checks";
import { redirect } from "remix/response/redirect";

import { readClientPackagePin } from "../../config/env.ts";
import {
  deleteClient,
  getClient,
  listClients,
  listClientsWithGroups,
} from "../../data/clients.ts";
import { describeClientVersion } from "../../data/client-package.ts";
import type { AdminIdentity } from "../../data/auth.ts";
import {
  getLatestDnsState,
  issueDnsDirective,
  DnsDirectiveTargetNotFoundError,
} from "../../data/dns-directives.ts";
import { getDnsProfile, listDnsProfiles } from "../../data/dns-profiles.ts";
import {
  GroupNameConflictError,
  createGroup,
  listGroupsWithMembers,
  replaceGroupMembers,
} from "../../data/groups.ts";
import {
  MessageTargetNotFoundError,
  dispatchTextMessageToClient,
  dispatchTextMessageToGroup,
} from "../../data/messages.ts";
import {
  deleteClientScreenshot,
  readClientScreenshot,
} from "../../data/screenshots.ts";
import { requireAdmin } from "../../middleware/admin.ts";
import { connectionRegistry } from "../../realtime/registry.ts";
import type { AppContext } from "../../router.ts";
import { routes } from "../../routes.ts";
import { getNotice, safeAdminReturnTo, withNotice, type Notice } from "../../utils/notice.ts";
import { render } from "../../utils/render.tsx";
import { ClientDetailPage } from "./client-detail-page.tsx";
import { ClientsPage } from "./clients-page.tsx";
import { DashboardPage } from "./dashboard-page.tsx";
import { GroupsPage } from "./groups-page.tsx";

let messageSchema = f.object({
  content: f.field(s.string().pipe(minLength(1), maxLength(500))),
});

let groupSchema = f.object({
  description: f.field(s.string()),
  name: f.field(s.string().pipe(minLength(1), maxLength(100))),
});

let composeSchema = f.object({
  content: f.field(s.string().pipe(minLength(1), maxLength(500))),
  target: f.field(s.string().pipe(minLength(1))),
});

let applyDnsSchema = f.object({
  profileId: f.field(s.string().pipe(minLength(1))),
});

function getCurrentAdminIdentity(context: Pick<AppContext, "get">) {
  let auth = context.get(Auth);
  if (!auth.ok || !auth.identity.isAdmin) {
    throw new Error("Expected an authenticated admin identity.");
  }

  return auth.identity as AdminIdentity;
}

/** Offline PCs never receive a message later, so the notice must say who missed it. */
function deliveryNotice(result: { deliveredLiveCount: number; targetCount: number }): Notice {
  let { deliveredLiveCount: delivered, targetCount: total } = result;
  let missed = total - delivered;
  if (total === 0) {
    return { text: "Not sent: this group has no PCs.", type: "error" };
  }
  if (delivered === 0) {
    return {
      text:
        total === 1
          ? "Not delivered: the PC is offline. Messages aren't queued, so send it again once it's back."
          : `Not delivered: all ${total} PCs are offline. Messages aren't queued, so send it again later.`,
      type: "error",
    };
  }
  if (missed === 0) {
    return {
      text: total === 1 ? "Message delivered." : `Message delivered to all ${total} PCs.`,
      type: "success",
    };
  }
  return {
    text: `Delivered to ${delivered} of ${total} PCs. ${missed} offline ${missed === 1 ? "PC" : "PCs"} won't get it; messages aren't queued.`,
    type: "success",
  };
}

function splitTarget(target: string): [string, string] {
  let separator = target.indexOf(":");
  return separator === -1
    ? [target, ""]
    : [target.slice(0, separator), target.slice(separator + 1)];
}

async function listRackClients() {
  let pin = readClientPackagePin();
  let rows = await listClientsWithGroups();
  return rows.map((client) => ({
    ...client,
    ...describeClientVersion(client.last_seen_version, pin),
    connected: connectionRegistry.isClientConnected(client.id),
  }));
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
      let [clients, groups] = await Promise.all([
        listRackClients(),
        listGroupsWithMembers(),
      ]);

      return render(
        <DashboardPage
          adminName={identity.user.name}
          clients={clients}
          groups={groups.map((group) => ({
            id: group.id,
            memberCount: group.members.length,
            name: group.name,
          }))}
          notice={getNotice(new URL(request.url))}
          pinnedVersion={readClientPackagePin()?.version ?? null}
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
    async index({ get, request }) {
      let identity = getCurrentAdminIdentity({ get });
      let clients = await listRackClients();

      return render(
        <ClientsPage
          adminName={identity.user.name}
          clients={clients}
          notice={getNotice(new URL(request.url))}
        />,
        request,
      );
    },

    async detail({ get, params, request }) {
      let identity = getCurrentAdminIdentity({ get });
      let [client, dnsProfiles, latestDnsState] = await Promise.all([
        getClient(params.clientId),
        listDnsProfiles(),
        getLatestDnsState(params.clientId),
      ]);
      if (!client) {
        return redirect(
          withNotice(request, routes.admin.clients.index.href(), {
            text: "Client not found.",
            type: "error",
          }),
        );
      }

      let pin = readClientPackagePin();

      return render(
        <ClientDetailPage
          adminName={identity.user.name}
          client={{
            ...client,
            ...describeClientVersion(client.last_seen_version, pin),
          }}
          connected={connectionRegistry.isClientConnected(client.id)}
          pinnedVersion={pin?.version ?? null}
          dnsProfiles={dnsProfiles}
          latestDnsState={latestDnsState}
          notice={getNotice(new URL(request.url))}
        />,
        request,
      );
    },

    async screenshot({ params }) {
      let screenshot = await readClientScreenshot(params.clientId);
      if (!screenshot) {
        return new Response("Not Found", { status: 404 });
      }

      return new Response(new Uint8Array(screenshot), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "image/png",
        },
      });
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
      await deleteClientScreenshot(client.id);

      return redirect(
        withNotice(request, routes.admin.clients.index.href(), {
          text: `Deleted ${client.name} and revoked its credentials.`,
          type: "success",
        }),
      );
    },

    async applyDns({ get, params, request }) {
      let parsed = s.parseSafe(applyDnsSchema, get(FormData));
      let detailUrl = routes.admin.clients.detail.href({
        clientId: params.clientId,
      });

      if (!parsed.success) {
        return redirect(
          withNotice(request, detailUrl, {
            text: parsed.issues[0]?.message ?? "Choose a DNS profile.",
            type: "error",
          }),
        );
      }

      let profile = await getDnsProfile(parsed.value.profileId);
      if (!profile) {
        return redirect(
          withNotice(request, detailUrl, {
            text: "DNS profile not found.",
            type: "error",
          }),
        );
      }

      try {
        let result = await issueDnsDirective({
          clientId: params.clientId,
          kind: "profile",
          primaryIp: profile.primary_ip,
          profileName: profile.name,
          secondaryIp: profile.secondary_ip,
        });

        return redirect(
          withNotice(request, detailUrl, {
            text: result.delivered
              ? `DNS profile ${profile.name} sent to client.`
              : `DNS profile ${profile.name} queued for the next client connection.`,
            type: "success",
          }),
        );
      } catch (error) {
        if (error instanceof DnsDirectiveTargetNotFoundError) {
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

    async resetDns({ params, request }) {
      let detailUrl = routes.admin.clients.detail.href({
        clientId: params.clientId,
      });

      try {
        let result = await issueDnsDirective({
          clientId: params.clientId,
          kind: "reset",
        });

        return redirect(
          withNotice(request, detailUrl, {
            text: result.delivered
              ? "DNS reset sent to client."
              : "DNS reset queued for the next client connection.",
            type: "success",
          }),
        );
      } catch (error) {
        if (error instanceof DnsDirectiveTargetNotFoundError) {
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
  },
} satisfies Controller<typeof routes.admin.clients, AppContext>;

export const adminScreenshots = {
  middleware: [
    requireAuth<AdminIdentity>({
      onFailure() {
        return redirect(routes.auth.login.index.href());
      },
    }),
    requireAdmin(),
  ],
  actions: {
    async client({ params, request }) {
      let client = await getClient(params.clientId);
      if (!client) {
        return redirect(
          withNotice(request, routes.admin.clients.index.href(), {
            text: "Client not found.",
            type: "error",
          }),
        );
      }

      let redirectedDetailUrl = routes.admin.clients.detail.href({
        clientId: client.id,
      });

      if (!connectionRegistry.sendTakeScreenshotCommand(client.id)) {
        return redirect(
          withNotice(request, redirectedDetailUrl, {
            text: "Client is offline.",
            type: "error",
          }),
        );
      }

      return redirect(
        withNotice(request, redirectedDetailUrl, {
          text: "Screenshot requested. It will appear after the client uploads it.",
          type: "success",
        }),
      );
    },
  },
} satisfies Controller<typeof routes.admin.screenshots, AppContext>;

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
    async index({ get, request }) {
      let identity = getCurrentAdminIdentity({ get });
      let [allClients, groupsWithMembers] = await Promise.all([
        listClients(),
        listGroupsWithMembers(),
      ]);

      return render(
        <GroupsPage
          adminName={identity.user.name}
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
    async compose({ get, request }) {
      let identity = getCurrentAdminIdentity({ get });
      let dashboardUrl = routes.admin.index.href();
      let parsed = s.parseSafe(composeSchema, get(FormData));
      if (!parsed.success) {
        return redirect(
          withNotice(request, dashboardUrl, {
            text: parsed.issues[0]?.message ?? "Choose who to message and write a message.",
            type: "error",
          }),
        );
      }

      let [kind, id] = splitTarget(parsed.value.target);
      if (!id || (kind !== "client" && kind !== "group")) {
        return redirect(
          withNotice(request, dashboardUrl, {
            text: "Choose a PC or group to message.",
            type: "error",
          }),
        );
      }

      try {
        let notice: Notice;
        if (kind === "client") {
          let result = await dispatchTextMessageToClient({
            clientId: id,
            content: parsed.value.content,
            senderAdminUserId: identity.user.id,
          });
          notice = deliveryNotice(result);
        } else {
          let result = await dispatchTextMessageToGroup({
            content: parsed.value.content,
            groupId: id,
            senderAdminUserId: identity.user.id,
          });
          notice = deliveryNotice(result);
        }

        return redirect(withNotice(request, dashboardUrl, notice));
      } catch (error) {
        if (error instanceof MessageTargetNotFoundError) {
          return redirect(
            withNotice(request, dashboardUrl, { text: error.message, type: "error" }),
          );
        }

        throw error;
      }
    },

    async client({ get, params, request }) {
      let identity = getCurrentAdminIdentity({ get });
      let formData = get(FormData);
      let returnUrl = safeAdminReturnTo(formData.get("returnTo"), routes.admin.clients.index.href());
      let parsed = s.parseSafe(messageSchema, formData);
      if (!parsed.success) {
        return redirect(
          withNotice(request, returnUrl, {
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
          withNotice(request, returnUrl, deliveryNotice(result)),
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
          withNotice(request, routes.admin.groups.index.href(), deliveryNotice(result)),
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

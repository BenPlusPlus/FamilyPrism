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
  listGroups,
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
import { getNotice, withNotice } from "../../utils/notice.ts";
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
      let pin = readClientPackagePin();
      let clientsWithGroups = await listClientsWithGroups();
      let clients = clientsWithGroups.map((client) => ({
        ...client,
        ...describeClientVersion(client.last_seen_version, pin),
      }));

      return render(
        <ClientsPage clients={clients} notice={notice} />,
        request,
      );
    },

    async detail({ params, request }) {
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

      return render(
        <ClientDetailPage
          client={{
            ...client,
            ...describeClientVersion(client.last_seen_version, readClientPackagePin()),
          }}
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

import type { Controller } from "remix/router";
import { Auth, requireAuth } from "remix/middleware/auth";
import * as s from "remix/data-schema";
import * as f from "remix/data-schema/form-data";
import { maxLength, minLength } from "remix/data-schema/checks";
import { redirect } from "remix/response/redirect";

import { readClientPackagePin } from "../../config/env.ts";
import {
  deleteClient,
  getClient,
  historyCollectionEnabled,
  listClients,
  listClientsWithGroups,
  setClientHistoryCollection,
} from "../../data/clients.ts";
import { describeClientVersion } from "../../data/client-package.ts";
import type { AdminIdentity } from "../../data/auth.ts";
import {
  extendDnsOverlay,
  getLatestDnsState,
  issueDnsDirective,
  DnsDirectiveTargetNotFoundError,
  DnsOverlayNotActiveError,
} from "../../data/dns-directives.ts";
import {
  clientSupportsDnsOverlay,
  DNS_OVERLAY_MIN_CLIENT_VERSION,
  parseDnsOverlayMinutes,
} from "../../data/dns-overlay.ts";
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
import {
  CLIENT_HISTORY_LIMIT,
  clearClientVisits,
  deleteVisit,
  listHistoryFilterOptions,
  listHistoryPage,
  VISIT_BROWSERS,
  type VisitBrowser,
} from "../../data/visits.ts";
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
import { HistoryPage } from "./history-page.tsx";

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

let extendDnsSchema = f.object({
  durationMinutes: f.field(s.string().pipe(minLength(1))),
});

let historyCollectionSchema = f.object({
  enabled: f.field(s.string().pipe(minLength(1))),
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
      let [client, dnsProfiles, latestDnsState, recentVisits] = await Promise.all([
        getClient(params.clientId),
        listDnsProfiles(),
        getLatestDnsState(params.clientId),
        listHistoryPage(1, new Date(), {
          clientId: params.clientId,
          pageSize: CLIENT_HISTORY_LIMIT,
        }),
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
          overlayCapable={clientSupportsDnsOverlay(client.last_seen_version)}
          overlayMinVersion={DNS_OVERLAY_MIN_CLIENT_VERSION}
          pinnedVersion={pin?.version ?? null}
          dnsProfiles={dnsProfiles}
          latestDnsState={latestDnsState}
          notice={getNotice(new URL(request.url))}
          visits={recentVisits.visits}
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

    async screenshotMeta({ params }) {
      let client = await getClient(params.clientId);
      if (!client) {
        return new Response("Not Found", { status: 404 });
      }

      let body = JSON.stringify({
        lastScreenshotAt: client.last_screenshot_at,
      });
      return new Response(body, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
        },
      });
    },

    async historyCollection({ get, params, request }) {
      let parsed = s.parseSafe(historyCollectionSchema, get(FormData));
      let detailUrl = routes.admin.clients.detail.href({
        clientId: params.clientId,
      });
      let enabled = parsed.success
        ? parsed.value.enabled === "on"
          ? true
          : parsed.value.enabled === "off"
            ? false
            : null
        : null;

      if (enabled === null) {
        return redirect(
          withNotice(request, detailUrl, {
            text: "Choose on or off for History collection.",
            type: "error",
          }),
        );
      }

      let client = await setClientHistoryCollection(params.clientId, enabled);
      if (!client) {
        return redirect(
          withNotice(request, routes.admin.clients.index.href(), {
            text: "Client not found.",
            type: "error",
          }),
        );
      }

      connectionRegistry.sendClientState(
        client.id,
        historyCollectionEnabled(client.history_collection),
      );

      return redirect(
        withNotice(request, detailUrl, {
          text: enabled
            ? `History collection is on for ${client.name}.`
            : `History collection is off for ${client.name}.`,
          type: "success",
        }),
      );
    },

    async clearHistory({ params, request }) {
      let client = await getClient(params.clientId);
      if (!client) {
        return redirect(
          withNotice(request, routes.admin.clients.index.href(), {
            text: "Client not found.",
            type: "error",
          }),
        );
      }

      await clearClientVisits(client.id);

      return redirect(
        withNotice(
          request,
          routes.admin.clients.detail.href({ clientId: client.id }),
          {
            text: `Cleared History for ${client.name}.`,
            type: "success",
          },
        ),
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

      let durationMinutes = parseDnsOverlayMinutes(
        String(get(FormData).get("durationMinutes") ?? ""),
      );
      if (durationMinutes === undefined) {
        return redirect(
          withNotice(request, detailUrl, {
            text: "Choose 5, 15, 30, or 60 minutes, or leave the time limit off.",
            type: "error",
          }),
        );
      }

      if (durationMinutes) {
        let client = await getClient(params.clientId);
        if (!clientSupportsDnsOverlay(client?.last_seen_version)) {
          return redirect(
            withNotice(request, detailUrl, {
              text: `Time limits need client v${DNS_OVERLAY_MIN_CLIENT_VERSION} or newer.`,
              type: "error",
            }),
          );
        }
      }

      try {
        let result = await issueDnsDirective({
          clientId: params.clientId,
          durationMinutes,
          kind: "profile",
          primaryIp: profile.primary_ip,
          profileName: profile.name,
          secondaryIp: profile.secondary_ip,
        });

        let limitLabel = durationMinutes ? ` for ${durationMinutes} minutes` : "";
        return redirect(
          withNotice(request, detailUrl, {
            text: result.delivered
              ? `DNS profile ${profile.name} sent to client${limitLabel}.`
              : durationMinutes
                ? `DNS profile ${profile.name} queued for ${durationMinutes} minutes. The time started now, even while this PC is offline.`
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

    async extendDns({ get, params, request }) {
      let parsed = s.parseSafe(extendDnsSchema, get(FormData));
      let detailUrl = routes.admin.clients.detail.href({
        clientId: params.clientId,
      });

      let durationMinutes = parsed.success
        ? parseDnsOverlayMinutes(parsed.value.durationMinutes)
        : undefined;

      if (!durationMinutes) {
        return redirect(
          withNotice(request, detailUrl, {
            text: "Choose 5, 15, 30, or 60 minutes to add.",
            type: "error",
          }),
        );
      }

      try {
        await extendDnsOverlay({
          clientId: params.clientId,
          durationMinutes,
        });

        return redirect(
          withNotice(request, detailUrl, {
            text: `Added ${durationMinutes} minutes to the DNS overlay.`,
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

        if (error instanceof DnsOverlayNotActiveError) {
          return redirect(
            withNotice(request, detailUrl, {
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

      let requestedUrl = new URL(
        withNotice(request, redirectedDetailUrl, {
          text: "Screenshot requested. It will appear after the client uploads it.",
          type: "success",
        }),
        request.url,
      );
      requestedUrl.searchParams.set("awaitScreenshot", "1");

      return redirect(`${requestedUrl.pathname}${requestedUrl.search}`);
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

export const adminHistory = {
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
      let url = new URL(request.url);
      let client = url.searchParams.get("client")?.trim() ?? "";
      let user = url.searchParams.get("user")?.trim() ?? "";
      let browserParam = url.searchParams.get("browser")?.trim() ?? "";
      let browser = VISIT_BROWSERS.includes(browserParam as VisitBrowser) ? browserParam : "";
      let q = url.searchParams.get("q")?.trim() ?? "";
      let requestedPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
      let [history, filterOptions] = await Promise.all([
        listHistoryPage(Number.isInteger(requestedPage) ? requestedPage : 1, new Date(), {
          browser: browser || undefined,
          clientId: client || undefined,
          search: q || undefined,
          windowsUser: user || undefined,
        }),
        listHistoryFilterOptions(),
      ]);

      return render(
        <HistoryPage
          adminName={identity.user.name}
          filterOptions={filterOptions}
          history={history}
          notice={getNotice(url)}
          query={{ browser, client, q, user }}
        />,
        request,
      );
    },

    async delete({ get, params, request }) {
      let returnUrl = safeAdminReturnTo(
        get(FormData).get("returnTo"),
        routes.admin.history.index.href(),
      );
      let visit = await deleteVisit(params.visitId);
      if (!visit) {
        return redirect(
          withNotice(request, returnUrl, {
            text: "Visit not found.",
            type: "error",
          }),
        );
      }

      return redirect(
        withNotice(request, returnUrl, {
          text: "Visit deleted.",
          type: "success",
        }),
      );
    },
  },
} satisfies Controller<typeof routes.admin.history, AppContext>;

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

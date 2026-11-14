import type { Controller } from "remix/router";
import { redirect } from "remix/response/redirect";

import { parseDnsOverlayMinutes } from "../../../data/dns-overlay.ts";
import {
  InvalidMacAddressError,
  isDeviceAccess,
  type DeviceAccess,
} from "../../../data/device-access.ts";
import {
  addNetworkDeviceMac,
  createNetworkDevice,
  deleteNetworkDevice,
  endTimedAccess,
  extendTimedAccess,
  InvalidNetworkDeviceError,
  loadNetworkOverview,
  MacAddressInUseError,
  NetworkDeviceNameConflictError,
  NetworkDeviceNotFoundError,
  removeNetworkDeviceMac,
  renameNetworkDevice,
  requestReconcile,
  setStandingAccess,
  startTimedAccess,
  TimedAccessNotActiveError,
} from "../../../data/network-devices.ts";
import { getHouseholdTimeZone } from "../../../data/household-settings.ts";
import { getRouterBridge } from "../../../data/router-bridges.ts";
import {
  getConsoleViewer,
  requireConsoleAccount,
  requireConsoleAdmin,
  requireRouterBridge,
} from "../../../middleware/console.ts";
import type { AppContext } from "../../../router.ts";
import { routes } from "../../../routes.ts";
import { viewerFrom } from "../../../ui/layout.tsx";
import { getNotice, safeAdminReturnTo, withNotice, type Notice } from "../../../utils/notice.ts";
import { render } from "../../../utils/render.tsx";
import { DeviceDetailPage } from "./device-detail-page.tsx";
import { DevicesPage } from "./devices-page.tsx";

const ACCESS_WORD: Record<DeviceAccess, string> = { allowed: "Allowed", blocked: "Blocked" };

function devicesHref() {
  return routes.admin.devices.index.href();
}

function field(form: FormData, name: string) {
  let value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Known failures become an error notice; anything else is a bug and propagates. */
function failureText(error: unknown) {
  if (
    error instanceof InvalidMacAddressError ||
    error instanceof InvalidNetworkDeviceError ||
    error instanceof MacAddressInUseError ||
    error instanceof NetworkDeviceNameConflictError ||
    error instanceof NetworkDeviceNotFoundError ||
    error instanceof TimedAccessNotActiveError
  ) {
    return error.message;
  }

  throw error;
}

/** Says whether the change reached the Router bridge or waits for it to reconnect. */
function sentText(text: string, delivered: boolean) {
  return delivered
    ? `${text} Sent to the Router bridge.`
    : `${text} The Router bridge is offline; the router catches up when it reconnects.`;
}

function minutesWord(minutes: number) {
  return minutes === 60 ? "1 hour" : `${minutes} minutes`;
}

async function attempt(
  request: Request,
  href: string,
  work: () => Promise<Notice>,
) {
  let notice: Notice;
  try {
    notice = await work();
  } catch (error) {
    notice = { text: failureText(error), type: "error" };
  }

  return redirect(withNotice(request, href, notice));
}

const adminOnly = { middleware: [requireConsoleAdmin()] };

export const adminDevices = {
  middleware: [...requireConsoleAccount(), requireRouterBridge()],
  actions: {
    async index({ get, request }) {
      let [overview, timeZone] = await Promise.all([loadNetworkOverview(), getHouseholdTimeZone()]);
      return render(
        <DevicesPage
          viewer={viewerFrom(getConsoleViewer({ get }))}
          overview={overview}
          notice={getNotice(new URL(request.url))}
          timeZone={timeZone}
        />,
        request,
      );
    },

    async detail({ get, params, request }) {
      let [overview, timeZone] = await Promise.all([loadNetworkOverview(), getHouseholdTimeZone()]);
      let device = overview.devices.find((candidate) => candidate.id === params.deviceId);
      if (!device) {
        return redirect(withNotice(request, devicesHref(), { text: "Device not found.", type: "error" }));
      }

      return render(
        <DeviceDetailPage
          viewer={viewerFrom(getConsoleViewer({ get }))}
          bridge={overview.bridge}
          device={device}
          notice={getNotice(new URL(request.url))}
          timeZone={timeZone}
        />,
        request,
      );
    },

    /** Block or allow, indefinitely or for a time limit preset. Parents can do this. */
    async access({ get, params, request }) {
      let form = get(FormData);
      let returnTo = safeAdminReturnTo(form.get("returnTo"), devicesHref());
      let access = field(form, "access");
      let minutes = parseDnsOverlayMinutes(field(form, "durationMinutes"));

      return attempt(request, returnTo, async () => {
        if (!isDeviceAccess(access)) {
          return { text: "Choose block or allow.", type: "error" };
        }
        if (minutes === undefined) {
          return { text: "Choose one of the time limits.", type: "error" };
        }

        if (minutes === null) {
          let { delivered, result } = await setStandingAccess(params.deviceId, access);
          return {
            text: sentText(`${ACCESS_WORD[access]}: ${result.name}.`, delivered),
            type: "success",
          };
        }

        let { delivered, result } = await startTimedAccess(params.deviceId, access, minutes);
        return {
          text: sentText(
            `${ACCESS_WORD[access]} for ${minutesWord(minutes)}: ${result.device.name}.`,
            delivered,
          ),
          type: "success",
        };
      });
    },

    async extend({ get, params, request }) {
      let form = get(FormData);
      let returnTo = safeAdminReturnTo(form.get("returnTo"), devicesHref());
      let minutes = parseDnsOverlayMinutes(field(form, "durationMinutes"));

      return attempt(request, returnTo, async () => {
        if (!minutes) {
          return { text: "Choose how much time to add.", type: "error" };
        }

        let { delivered, result } = await extendTimedAccess(params.deviceId, minutes);
        return {
          text: sentText(`Added ${minutesWord(minutes)} for ${result.device.name}.`, delivered),
          type: "success",
        };
      });
    },

    async endTimed({ get, params, request }) {
      let returnTo = safeAdminReturnTo(get(FormData).get("returnTo"), devicesHref());

      return attempt(request, returnTo, async () => {
        let { delivered, result } = await endTimedAccess(params.deviceId);
        return {
          text: sentText(`Time limit ended for ${result.name}.`, delivered),
          type: "success",
        };
      });
    },

    /** Asks the bridge to read the router now, for the Check router button. */
    async check({ request }) {
      let bridge = await getRouterBridge();
      let asked = bridge ? requestReconcile(bridge.id) : false;
      return redirect(
        withNotice(request, devicesHref(), {
          text: asked
            ? "Asked the Router bridge to check the router. Refresh in a few seconds."
            : "The Router bridge is offline, so it can't check the router right now.",
          type: asked ? "success" : "error",
        }),
      );
    },

    create: {
      ...adminOnly,
      async handler({ get, request }) {
        let form = get(FormData);
        let access = field(form, "access") || "allowed";

        return attempt(request, devicesHref(), async () => {
          if (!isDeviceAccess(access)) {
            return { text: "Choose whether it starts blocked or allowed.", type: "error" };
          }

          let { delivered, result } = await createNetworkDevice({
            mac: field(form, "mac"),
            name: field(form, "name"),
            standingAccess: access,
          });
          return {
            text: sentText(`Added ${result.name} (${ACCESS_WORD[access].toLowerCase()}).`, delivered),
            type: "success",
          };
        });
      },
    },

    /** Takes over a router entry FamilyPrism doesn't manage yet: as a new device or another address for one. */
    adopt: {
      ...adminOnly,
      async handler({ get, request }) {
        let form = get(FormData);
        let mac = field(form, "mac");
        let deviceId = field(form, "deviceId");

        return attempt(request, devicesHref(), async () => {
          if (deviceId) {
            let { delivered, result } = await addNetworkDeviceMac(deviceId, mac);
            return {
              text: sentText(`${result.mac} now belongs to ${result.device.name}.`, delivered),
              type: "success",
            };
          }

          // The entry is in the router's table, so the device is already blocked.
          let { delivered, result } = await createNetworkDevice({
            mac,
            name: field(form, "name"),
            standingAccess: "blocked",
          });
          return { text: sentText(`Added ${result.name} (blocked).`, delivered), type: "success" };
        });
      },
    },

    rename: {
      ...adminOnly,
      async handler({ get, params, request }) {
        let href = routes.admin.devices.detail.href({ deviceId: params.deviceId });
        return attempt(request, href, async () => {
          let { result } = await renameNetworkDevice(params.deviceId, field(get(FormData), "name"));
          return { text: `Renamed to ${result}.`, type: "success" };
        });
      },
    },

    addMac: {
      ...adminOnly,
      async handler({ get, params, request }) {
        let href = routes.admin.devices.detail.href({ deviceId: params.deviceId });
        return attempt(request, href, async () => {
          let { delivered, result } = await addNetworkDeviceMac(
            params.deviceId,
            field(get(FormData), "mac"),
          );
          return { text: sentText(`Added ${result.mac}.`, delivered), type: "success" };
        });
      },
    },

    removeMac: {
      ...adminOnly,
      async handler({ get, params, request }) {
        let href = routes.admin.devices.detail.href({ deviceId: params.deviceId });
        let mac = field(get(FormData), "mac");
        return attempt(request, href, async () => {
          await removeNetworkDeviceMac(params.deviceId, mac);
          return {
            text: `Removed ${mac}. If the router was blocking it, it still is until you adopt or remove that entry.`,
            type: "success",
          };
        });
      },
    },

    delete: {
      ...adminOnly,
      async handler({ params, request }) {
        return attempt(request, devicesHref(), async () => {
          let { result } = await deleteNetworkDevice(params.deviceId);
          return {
            text: `Removed ${result.name} from FamilyPrism. Its router entries stay as they are.`,
            type: "success",
          };
        });
      },
    },
  },
} satisfies Controller<typeof routes.admin.devices, AppContext>;

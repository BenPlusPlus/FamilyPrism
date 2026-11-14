import type { Controller } from "remix/router";
import type { Handle } from "remix/component";
import { redirect } from "remix/response/redirect";

import { getHouseholdTimeZone } from "../../../../data/household-settings.ts";
import { loadNetworkOverview, type BridgeOverview } from "../../../../data/network-devices.ts";
import { getRouterBridge, removeRouterBridge } from "../../../../data/router-bridges.ts";
import { getConsoleViewer } from "../../../../middleware/console.ts";
import type { AppContext } from "../../../../router.ts";
import { routes } from "../../../../routes.ts";
import { Icon } from "../../../../ui/icons.tsx";
import { AdminShell, viewerFrom, type Viewer } from "../../../../ui/layout.tsx";
import { NoticeBar } from "../../../../ui/notice.tsx";
import { getNotice, withNotice, type Notice } from "../../../../utils/notice.ts";
import { render } from "../../../../utils/render.tsx";
import { formatDateTime } from "../../../../utils/time-zone.ts";
import { adminSettingsMiddleware } from "../controller.tsx";

export const adminSettingsRouterBridge = {
  middleware: adminSettingsMiddleware,
  actions: {
    async index({ get, request }) {
      let [overview, timeZone] = await Promise.all([loadNetworkOverview(), getHouseholdTimeZone()]);
      return render(
        <RouterBridgePage
          viewer={viewerFrom(getConsoleViewer({ get }))}
          bridge={overview.bridge}
          deviceCount={overview.devices.length}
          notice={getNotice(new URL(request.url))}
          timeZone={timeZone}
        />,
        request,
      );
    },

    async remove({ request }) {
      let bridge = await getRouterBridge();
      let removed = bridge ? await removeRouterBridge(bridge.id) : null;
      return redirect(
        withNotice(request, routes.admin.settings.routerBridge.index.href(), {
          text: removed
            ? `Removed ${removed.name}. The router keeps whatever it was blocking.`
            : "No Router bridge is registered.",
          type: removed ? "success" : "error",
        }),
      );
    },
  },
} satisfies Controller<typeof routes.admin.settings.routerBridge, AppContext>;

function RouterBridgePage(
  handle: Handle<{
    viewer: Viewer;
    bridge: BridgeOverview | null;
    deviceCount: number;
    notice: Notice | null;
    timeZone: string;
  }>,
) {
  return () => {
    let { viewer, bridge, deviceCount, notice, timeZone } = handle.props;

    return (
      <AdminShell active="dns" title="Router bridge" viewer={viewer}>
        <a class="crumb" href={routes.admin.settings.index.href()}>
          <Icon name="back" />
          Settings
        </a>
        <header class="page-head">
          <div>
            <h1>Router bridge</h1>
            <p>
              Optional. A small FamilyPrism service on an always-on PC at home that blocks phones,
              tablets, and consoles at the router.
            </p>
          </div>
        </header>
        <NoticeBar notice={notice} />

        {bridge ? (
          <>
            <section class="panel" aria-labelledby="bridge-facts-title">
              <div class="panel-head">
                <h2 id="bridge-facts-title">{bridge.name}</h2>
                <span class={`status ${bridge.connected ? "home" : "away"}`}>
                  {bridge.connected ? "Connected" : "Offline"}
                </span>
              </div>
              <dl class="facts panel-body">
                <dt>Router</dt>
                <dd>{bridge.routerModel ?? <span class="muted">Not reported</span>}</dd>
                <dt>Version</dt>
                <dd>{bridge.version ? <span class="data">v{bridge.version}</span> : <span class="muted">Unknown</span>}</dd>
                <dt>Last heard from</dt>
                <dd>
                  {bridge.lastReportAt ? formatDateTime(bridge.lastReportAt, timeZone) : <span class="muted">Not yet</span>}
                </dd>
                <dt>Devices</dt>
                <dd>
                  <a href={routes.admin.devices.index.href()}>
                    {deviceCount} {deviceCount === 1 ? "device" : "devices"}
                  </a>
                </dd>
                {bridge.error ? (
                  <>
                    <dt>Problem</dt>
                    <dd>{bridge.error}</dd>
                  </>
                ) : null}
              </dl>
            </section>
            <section class="panel danger-zone" aria-labelledby="danger-title">
              <div class="panel-head">
                <h2 id="danger-title">Danger zone</h2>
              </div>
              <div class="panel-body">
                <details class="disclose">
                  <summary>
                    <Icon name="chevron" />
                    Remove {bridge.name}
                  </summary>
                  <form
                    class="disclose-body"
                    method="post"
                    action={routes.admin.settings.routerBridge.remove.href()}
                  >
                    <p class="muted">
                      Disconnects the bridge and revokes its credential, and the Devices section
                      goes away. The router keeps blocking whatever it blocks now, and FamilyPrism
                      keeps your device list for when a bridge registers again.
                    </p>
                    <div class="form-foot">
                      <span></span>
                      <button class="btn danger" type="submit">
                        Remove {bridge.name}
                      </button>
                    </div>
                  </form>
                </details>
              </div>
            </section>
          </>
        ) : (
          <section class="panel" aria-labelledby="bridge-setup-title">
            <div class="panel-head">
              <h2 id="bridge-setup-title">Not set up</h2>
            </div>
            <div class="panel-body">
              <p class="muted">
                Install the FamilyPrism Router bridge on a Windows PC that stays on and is on the
                home network. Register it with the registration password and give it the router's
                admin username and password; those stay on that PC. Devices appears in the console
                once it registers.
              </p>
            </div>
          </section>
        )}
      </AdminShell>
    );
  };
}

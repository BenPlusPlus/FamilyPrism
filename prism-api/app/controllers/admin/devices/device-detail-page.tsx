import type { Handle } from "remix/component";

import type { BridgeOverview, DeviceOverview } from "../../../data/network-devices.ts";
import { routes } from "../../../routes.ts";
import { Icon } from "../../../ui/icons.tsx";
import { AdminShell, type Viewer } from "../../../ui/layout.tsx";
import { NoticeBar } from "../../../ui/notice.tsx";
import type { Notice } from "../../../utils/notice.ts";
import {
  AccessControls,
  accessHint,
  BridgePanel,
  DeviceStamp,
  PrivateAddressFlag,
  PrivateAddressHint,
  TimedStatus,
} from "./device-parts.tsx";

export function DeviceDetailPage(
  handle: Handle<{
    viewer: Viewer;
    bridge: BridgeOverview | null;
    device: DeviceOverview;
    notice: Notice | null;
    timeZone: string;
  }>,
) {
  return () => {
    let { viewer, bridge, device, notice, timeZone } = handle.props;
    let isAdmin = viewer.role === "admin";
    let ids = { deviceId: device.id };
    let detailHref = routes.admin.devices.detail.href(ids);
    let canRemoveMac = device.macs.length > 1;

    return (
      <AdminShell active="devices" title={device.name} viewer={viewer}>
        <a class="crumb" href={routes.admin.devices.index.href()}>
          <Icon name="back" />
          Devices
        </a>

        <header class="page-head">
          <div>
            <h1>{device.name}</h1>
            <p>
              {device.macs.length === 1
                ? "One network address."
                : `${device.macs.length} network addresses, blocked and allowed together.`}
            </p>
          </div>
        </header>

        <NoticeBar notice={notice} />

        <section class="panel" aria-labelledby="access-title">
          <div class="panel-head">
            <h2 id="access-title">Internet</h2>
            <DeviceStamp device={device} />
          </div>
          <div class="panel-body device-access" data-dns-overlay={device.timed ? "" : undefined}>
            <TimedStatus device={device} />
            {device.status.detail ? <p class="hint">{device.status.detail}</p> : null}
            <AccessControls device={device} returnTo={detailHref} />
            <p class="hint">{accessHint(device)}</p>
          </div>
        </section>

        <section class="panel" aria-labelledby="macs-title">
          <div class="panel-head">
            <h2 id="macs-title">Addresses</h2>
            <span class="count">{device.macs.length}</span>
          </div>
          <div class="panel-body">
            <ul class="rows">
              {device.macs.map((entry) => (
                <li>
                  <span class="data">{entry.mac}</span>
                  <span>{entry.private ? <PrivateAddressFlag /> : null}</span>
                  {isAdmin && canRemoveMac ? (
                    <form method="post" action={routes.admin.devices.removeMac.href(ids)}>
                      <input type="hidden" name="mac" value={entry.mac} />
                      <button class="btn-link danger" type="submit">
                        Remove
                      </button>
                    </form>
                  ) : (
                    <span></span>
                  )}
                </li>
              ))}
            </ul>
            {device.macs.some((entry) => entry.private) ? <PrivateAddressHint /> : null}
            {isAdmin ? (
              <form method="post" action={routes.admin.devices.addMac.href(ids)}>
                <label class="field">
                  <span>Add an address</span>
                  <input
                    type="text"
                    name="mac"
                    required
                    maxlength={17}
                    class="mono"
                    autocomplete="off"
                    spellcheck={false}
                    placeholder="3C-A9-F4-10-20-9E"
                  />
                </label>
                <div class="form-foot">
                  <span class="hint">For example, the Wi-Fi address of a console that's also wired.</span>
                  <button class="btn secondary" type="submit">
                    <Icon name="plus" />
                    Add address
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </section>

        <BridgePanel bridge={bridge} timeZone={timeZone} />

        {isAdmin ? (
          <section class="panel" aria-labelledby="rename-title">
            <div class="panel-head">
              <h2 id="rename-title">Name</h2>
            </div>
            <form class="panel-body" method="post" action={routes.admin.devices.rename.href(ids)}>
              <label class="field">
                <span>Name</span>
                <input type="text" name="name" required maxlength={100} value={device.name} />
              </label>
              <div class="form-foot">
                <span class="hint">The router gets a simpler version of this name.</span>
                <button class="btn secondary" type="submit">
                  Save
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {isAdmin ? (
          <section class="panel danger-zone" aria-labelledby="danger-title">
            <div class="panel-head">
              <h2 id="danger-title">Danger zone</h2>
            </div>
            <div class="panel-body">
              <details class="disclose">
                <summary>
                  <Icon name="chevron" />
                  Remove {device.name} from FamilyPrism
                </summary>
                <form class="disclose-body" method="post" action={routes.admin.devices.delete.href(ids)}>
                  <p class="muted">
                    FamilyPrism stops managing it. If the router is blocking it, it stays blocked
                    and shows up under "On the router, not in FamilyPrism"; allow it first if you
                    want it unblocked.
                  </p>
                  <div class="form-foot">
                    <span></span>
                    <button class="btn danger" type="submit">
                      Remove {device.name}
                    </button>
                  </div>
                </form>
              </details>
            </div>
          </section>
        ) : null}
      </AdminShell>
    );
  };
}

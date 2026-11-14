import type { Handle } from "remix/component";

import type { NetworkOverview } from "../../../data/network-devices.ts";
import { routes } from "../../../routes.ts";
import { Icon } from "../../../ui/icons.tsx";
import { AdminShell, type Viewer } from "../../../ui/layout.tsx";
import { NoticeBar } from "../../../ui/notice.tsx";
import type { Notice } from "../../../utils/notice.ts";
import { AccessControls, BridgePanel, DeviceStamp } from "./device-parts.tsx";

function headline(overview: NetworkOverview) {
  let total = overview.devices.length;
  if (total === 0) {
    return "No devices yet";
  }

  let blocked = overview.devices.filter((device) => device.status.kind === "blocked").length;
  return blocked === 0
    ? `All ${total} ${total === 1 ? "device is" : "devices are"} allowed`
    : `${blocked} of ${total} ${total === 1 ? "device" : "devices"} blocked`;
}

export function DevicesPage(
  handle: Handle<{
    viewer: Viewer;
    notice: Notice | null;
    overview: NetworkOverview;
    timeZone: string;
  }>,
) {
  return () => {
    let { viewer, notice, overview, timeZone } = handle.props;
    let isAdmin = viewer.role === "admin";
    let returnTo = routes.admin.devices.index.href();

    return (
      <AdminShell active="devices" title="Devices" viewer={viewer}>
        <header class="page-head">
          <div>
            <h1>{headline(overview)}</h1>
            <p>
              Phones, tablets, and consoles that can't run FamilyPrism. Blocking one stops its
              internet at the router; it stays on the home network.
            </p>
          </div>
          <div class="head-actions">
            <form method="post" action={routes.admin.devices.check.href()}>
              <button class="btn secondary" type="submit" disabled={!overview.bridge?.connected}>
                <Icon name="refresh" />
                Check router
              </button>
            </form>
          </div>
        </header>

        <NoticeBar notice={notice} />

        <BridgePanel bridge={overview.bridge} timeZone={timeZone} />

        <section class="panel" aria-labelledby="devices-title">
          <div class="panel-head">
            <h2 id="devices-title">Devices</h2>
            <span class="count">{overview.devices.length}</span>
          </div>
          {overview.devices.length === 0 ? (
            <p class="empty">
              <strong>Nothing here yet.</strong>
              {isAdmin
                ? "Add a device below, or adopt one the router already blocks."
                : "An admin can add devices."}
            </p>
          ) : (
            <ul class="device-list panel-body">
              {overview.devices.map((device) => (
                <li class="device-row">
                  <div class="device-main">
                    <a class="row-link" href={routes.admin.devices.detail.href({ deviceId: device.id })}>
                      {device.name}
                      <Icon name="chevron" />
                    </a>
                    <span class="data device-macs">
                      {device.macs.map((entry) => entry.mac).join(", ")}
                    </span>
                    {device.macs.some((entry) => entry.private) ? (
                      <span class="tape warn" title="A private Wi-Fi address can change. Open the device for details.">
                        Private address
                      </span>
                    ) : null}
                  </div>
                  <div class="device-state">
                    <DeviceStamp device={device} />
                    {device.status.detail ? <p class="hint">{device.status.detail}</p> : null}
                  </div>
                  <AccessControls device={device} returnTo={returnTo} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {overview.unmanaged.length > 0 ? (
          <section class="panel" aria-labelledby="unmanaged-title">
            <div class="panel-head">
              <h2 id="unmanaged-title">On the router, not in FamilyPrism</h2>
              <span class="count">{overview.unmanaged.length}</span>
            </div>
            <div class="panel-body">
              <p class="muted">
                The router blocks these addresses, but FamilyPrism doesn't manage them, so the
                bridge leaves them alone.
                {isAdmin ? " Adopt one to control it from here." : " An admin can adopt them."}
              </p>
              <ul class="device-list">
                {overview.unmanaged.map((entry) => (
                  <li class="device-row">
                    <div class="device-main">
                      <strong>{entry.name}</strong>
                      <span class="data device-macs">{entry.mac}</span>
                    </div>
                    {isAdmin ? (
                      <div class="device-adopt">
                        <form class="inline-form" method="post" action={routes.admin.devices.adopt.href()}>
                          <input type="hidden" name="mac" value={entry.mac} />
                          <label class="field">
                            <span>Name</span>
                            <input name="name" required maxlength={100} value={entry.suggestedName} />
                          </label>
                          <button class="btn secondary" type="submit">
                            Adopt as new device
                          </button>
                        </form>
                        {overview.devices.length > 0 ? (
                          <form class="inline-form" method="post" action={routes.admin.devices.adopt.href()}>
                            <input type="hidden" name="mac" value={entry.mac} />
                            <label class="field">
                              <span>Or add to</span>
                              <select name="deviceId" required>
                                <option value="">Choose a device</option>
                                {overview.devices.map((device) => (
                                  <option value={device.id}>{device.name}</option>
                                ))}
                              </select>
                            </label>
                            <button class="btn secondary" type="submit">
                              Add address
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {isAdmin ? (
          <section class="panel" aria-labelledby="add-device-title">
            <div class="panel-head">
              <h2 id="add-device-title">Add a device</h2>
            </div>
            <form class="panel-body" method="post" action={routes.admin.devices.create.href()}>
              <div class="form-row">
                <label class="field">
                  <span>Name</span>
                  <input name="name" required maxlength={100} placeholder="Kids' iPad" />
                </label>
                <label class="field">
                  <span>MAC address</span>
                  <input
                    name="mac"
                    required
                    maxlength={17}
                    class="data"
                    autocomplete="off"
                    spellcheck={false}
                    placeholder="3C-A9-F4-10-20-AB"
                  />
                </label>
                <label class="field">
                  <span>Starts</span>
                  <select name="access">
                    <option value="allowed">Allowed</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </label>
              </div>
              <div class="form-foot">
                <span class="hint">
                  A console with both wired and Wi-Fi has two addresses; add the second one on the
                  device's page. On an iPhone or iPad, set Private Wi-Fi Address to Fixed for the
                  home network first so the address stays the same.
                </span>
                <button class="btn" type="submit">
                  <Icon name="plus" />
                  Add device
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </AdminShell>
    );
  };
}

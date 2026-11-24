import type { Handle } from "remix/component";

import { formatDnsRemaining } from "../../../data/dns-overlay.ts";
import {
  DEVICE_TIME_LIMIT_MINUTES,
  otherAccess,
  type DeviceAccess,
} from "../../../data/device-access.ts";
import type { BridgeOverview, DeviceOverview } from "../../../data/network-devices.ts";
import { routes } from "../../../routes.ts";
import { Icon } from "../../../ui/icons.tsx";
import { formatDateTime } from "../../../utils/time-zone.ts";

const ACTION_WORD: Record<DeviceAccess, string> = { allowed: "Allow", blocked: "Block" };
const STATE_WORD: Record<DeviceAccess, string> = { allowed: "allowed", blocked: "blocked" };

function presetLabel(minutes: number) {
  return minutes === 60 ? "1 hr" : `${minutes} min`;
}

export function DeviceStamp(handle: Handle<{ device: DeviceOverview }>) {
  return () => {
    let { status } = handle.props.device;
    return <span class={`stamp device-${status.kind}`}>{status.label}</span>;
  };
}

/** A caution flag for a MAC address that may change (iOS/Android private Wi-Fi address). */
export function PrivateAddressFlag(handle: Handle<{ title?: string }>) {
  return () => (
    <span class="addr-flag" title={handle.props.title}>
      <Icon name="alert" />
      Private address
    </span>
  );
}

/**
 * The time left on a temporary block or allow. It sits inside the `data-dns-overlay` root with
 * the add-time form, so the shared countdown can tick it and swap in the restore hint at zero.
 */
export function TimedStatus(handle: Handle<{ device: DeviceOverview }>) {
  return () => {
    let { device } = handle.props;
    if (!device.timed) {
      return null;
    }

    return (
      <div class="device-timed">
        <p class="device-timed-label">
          {device.timed.access === "allowed" ? "Allowed" : "Blocked"} for now, then{" "}
          {STATE_WORD[device.standing]}
        </p>
        <p class="dns-remaining" data-dns-remaining data-deadline={device.timed.expiresAt}>
          {formatDnsRemaining(device.timed.remainingMs)}
        </p>
        <p class="hint" data-dns-restore-hint hidden>
          Time is up. It should be {STATE_WORD[device.standing]} again.{" "}
          <button class="btn-link" type="button" data-reload>
            Refresh
          </button>{" "}
          to confirm.
        </p>
      </div>
    );
  };
}

/** What the quick toggle does, said once per list or once per device. */
export function accessHint(device: DeviceOverview) {
  if (device.timed) {
    return `Add time, or end it now and it's ${STATE_WORD[device.standing]} again.`;
  }

  let next = otherAccess(device.standing);
  return `${ACTION_WORD[next]} until you change it, or for a while and then ${STATE_WORD[device.standing]} again.`;
}

/**
 * The quick toggle, on one line. With no time limit running: the opposite of standing access,
 * now or for a preset. With one running: add time, or end it. The add-time form comes first so
 * the shared countdown hides it when time is up.
 */
export function AccessControls(handle: Handle<{ device: DeviceOverview; returnTo: string }>) {
  return () => {
    let { device, returnTo } = handle.props;
    let ids = { deviceId: device.id };

    if (device.timed) {
      return (
        <div class="device-actions timed">
          <form method="post" action={routes.admin.devices.extend.href(ids)}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <div class="device-presets" role="group" aria-label={`Add time for ${device.name}`}>
              {DEVICE_TIME_LIMIT_MINUTES.map((minutes) => (
                <button class="btn secondary" type="submit" name="durationMinutes" value={String(minutes)}>
                  +{presetLabel(minutes)}
                </button>
              ))}
            </div>
          </form>
          <form method="post" action={routes.admin.devices.endTimed.href(ids)}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              class="btn secondary"
              type="submit"
              aria-label={`End now; ${device.name} is ${STATE_WORD[device.standing]} again`}
            >
              End now
            </button>
          </form>
        </div>
      );
    }

    let next = otherAccess(device.standing);
    return (
      <form class="device-actions" method="post" action={routes.admin.devices.access.href(ids)}>
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="access" value={next} />
        <div class="device-presets" role="group" aria-label={`${ACTION_WORD[next]} ${device.name}`}>
          <button
            class={next === "blocked" ? "btn danger" : "btn"}
            type="submit"
            name="durationMinutes"
            value=""
          >
            {ACTION_WORD[next]}
          </button>
          {DEVICE_TIME_LIMIT_MINUTES.map((minutes) => (
            <button
              class="btn secondary"
              type="submit"
              name="durationMinutes"
              value={String(minutes)}
              aria-label={`${ACTION_WORD[next]} for ${presetLabel(minutes)}`}
            >
              {presetLabel(minutes)}
            </button>
          ))}
        </div>
      </form>
    );
  };
}

export function PrivateAddressHint() {
  return () => (
    <p class="hint">
      This looks like a private Wi-Fi address. On an iPhone or iPad, open the home network in
      Wi-Fi settings and set Private Wi-Fi Address to Fixed (or Off), or the address can change
      and the block stops working.
    </p>
  );
}

export function BridgePanel(
  handle: Handle<{ bridge: BridgeOverview | null; timeZone: string }>,
) {
  return () => {
    let { bridge, timeZone } = handle.props;
    if (!bridge) {
      return null;
    }

    return (
      <section class="panel" aria-labelledby="bridge-title">
        <div class="panel-head">
          <h2 id="bridge-title">Router bridge</h2>
          <span class={`status ${bridge.connected ? "home" : "away"}`}>
            {bridge.connected ? "Connected" : "Offline"}
          </span>
        </div>
        <div class="panel-body">
          <p class="muted">
            {bridge.name}
            {bridge.lastReportAt
              ? `, last heard from ${formatDateTime(bridge.lastReportAt, timeZone)}.`
              : ", hasn't checked the router yet."}
            {bridge.connected ? "" : " Changes wait until it reconnects."}
          </p>
          {bridge.error ? (
            <p class="notice error" role="alert">
              <Icon name="alert" />
              <span>{bridge.error}</span>
            </p>
          ) : null}
        </div>
      </section>
    );
  };
}

import type { Handle } from "remix/component";

import { historyCollectionEnabled, type getClient } from "../../data/clients.ts";
import type { ClientVersionView } from "../../data/client-package.ts";
import type { getLatestDnsState } from "../../data/dns-directives.ts";
import {
  DNS_OVERLAY_PRESET_MINUTES,
  formatDnsRemaining,
  presentClientDnsState,
  type DnsDirectiveStatus,
} from "../../data/dns-overlay.ts";
import type { listDnsProfiles } from "../../data/dns-profiles.ts";
import type { HistoryVisit } from "../../data/visits.ts";
import { routes } from "../../routes.ts";
import { Icon } from "../../ui/icons.tsx";
import { KeyTag } from "../../ui/key-tag.tsx";
import { AdminShell } from "../../ui/layout.tsx";
import { NoticeBar } from "../../ui/notice.tsx";
import { VisitLog } from "../../ui/visit-log.tsx";
import type { Notice } from "../../utils/notice.ts";
import { formatDateTime } from "../../utils/time-zone.ts";

const DNS_STATUS_LABEL: Record<DnsDirectiveStatus, string> = {
  applied: "Applied",
  delivered: "Delivered, waiting for result",
  failed: "Failed",
  pending: "Queued until the PC connects",
};

export function ClientDetailPage(
  handle: Handle<{
    adminName: string;
    client: NonNullable<Awaited<ReturnType<typeof getClient>>> & ClientVersionView;
    connected: boolean;
    dnsProfiles: Awaited<ReturnType<typeof listDnsProfiles>>;
    latestDnsState: Awaited<ReturnType<typeof getLatestDnsState>>;
    notice: Notice | null;
    overlayCapable: boolean;
    overlayMinVersion: string;
    pinnedVersion: string | null;
    timeZone: string;
    visits: HistoryVisit[];
  }>,
) {
  return () => {
    let {
      adminName,
      client,
      connected,
      dnsProfiles,
      latestDnsState,
      notice,
      overlayCapable,
      overlayMinVersion,
      pinnedVersion,
      timeZone,
      visits,
    } = handle.props;
    let formatTime = (value: string | number | Date) => formatDateTime(value, timeZone);
    let detailHref = routes.admin.clients.detail.href({ clientId: client.id });
    let screenshotUrl = routes.admin.clients.screenshot.href({ clientId: client.id });
    let screenshotSrc = client.last_screenshot_at
      ? `${screenshotUrl}?t=${encodeURIComponent(client.last_screenshot_at)}`
      : screenshotUrl;
    let screenshotEmptyCopy = connected
      ? "No screenshot yet. Use Take screenshot to grab the current screen."
      : "No screenshot yet. One can be taken once this PC is connected.";
    let collecting = historyCollectionEnabled(client.history_collection);
    let dns = presentClientDnsState(latestDnsState);

    return (
      <AdminShell active="clients" title={client.name} adminName={adminName}>
        <a class="crumb" href={routes.admin.clients.index.href()}>
          <Icon name="back" />
          Clients
        </a>

        <header class="page-head">
          <div class="identity">
            <KeyTag client={client} connected={connected} />
            <div>
              <h1>{client.name}</h1>
              <p>
                {connected
                  ? "Connected now. Commands and messages arrive immediately."
                  : "Offline. Screenshots and messages need it connected; DNS changes wait until it's back."}
              </p>
            </div>
          </div>
          <div class="head-actions">
            <form
              method="post"
              action={routes.admin.screenshots.client.href({ clientId: client.id })}
              data-live-screenshot-form
              data-client-id={client.id}
            >
              <button class="btn" type="submit" disabled={!connected}>
                <Icon name="camera" />
                Take screenshot
              </button>
            </form>
          </div>
        </header>

        <NoticeBar notice={notice} />

        <div class="split">
          <div class="stack">
            <section class="panel" aria-labelledby="screen-title">
              <div class="panel-head">
                <h2 id="screen-title">Latest screenshot</h2>
              </div>
              <div
                class={client.last_screenshot_at ? "panel-body has-screenshot" : "panel-body"}
                data-live-screenshot
                data-client-id={client.id}
                data-client-name={client.name}
                data-screenshot-at={client.last_screenshot_at ?? ""}
                data-screenshot-meta={routes.admin.clients.screenshotMeta.href({
                  clientId: client.id,
                })}
                data-screenshot-src={screenshotUrl}
                data-time-zone={timeZone}
                data-empty-copy={screenshotEmptyCopy}
              >
                <div class="screen-empty" data-screenshot-empty>
                  {screenshotEmptyCopy}
                </div>
                <figure class="screen">
                  <button
                    type="button"
                    class="screen-zoom"
                    popovertarget="screenshot"
                    aria-label="Enlarge screenshot"
                  >
                    <img
                      data-screenshot-image
                      src={client.last_screenshot_at ? screenshotSrc : undefined}
                      alt={`Latest screenshot from ${client.name}`}
                    />
                  </button>
                  <figcaption>
                    Captured{" "}
                    <time
                      data-screenshot-time
                      datetime={client.last_screenshot_at ?? ""}
                    >
                      {client.last_screenshot_at
                        ? formatTime(client.last_screenshot_at)
                        : ""}
                    </time>
                    <button type="button" class="btn-link" popovertarget="screenshot">
                      Enlarge
                    </button>
                  </figcaption>
                </figure>
                <div
                  class="lightbox"
                  id="screenshot"
                  popover="auto"
                  role="dialog"
                  aria-label={`Screenshot from ${client.name}`}
                >
                  <button
                    type="button"
                    class="lightbox-scrim"
                    popovertarget="screenshot"
                    popovertargetaction="hide"
                    aria-label="Close"
                    tabindex={-1}
                  ></button>
                  <figure class="lightbox-frame">
                    <img
                      data-screenshot-image
                      src={client.last_screenshot_at ? screenshotSrc : undefined}
                      alt={`Latest screenshot from ${client.name}`}
                    />
                    <figcaption>
                      <span>
                        {client.name} ·{" "}
                        <time
                          data-screenshot-time
                          datetime={client.last_screenshot_at ?? ""}
                        >
                          {client.last_screenshot_at
                            ? formatTime(client.last_screenshot_at)
                            : ""}
                        </time>
                      </span>
                      <span class="lightbox-actions">
                        <a
                          data-screenshot-original
                          href={client.last_screenshot_at ? screenshotSrc : screenshotUrl}
                          target="_blank"
                          rel="noopener"
                        >
                          Open original
                        </a>
                        <button
                          type="button"
                          class="btn secondary"
                          popovertarget="screenshot"
                          popovertargetaction="hide"
                        >
                          Close
                        </button>
                      </span>
                    </figcaption>
                  </figure>
                </div>
              </div>
            </section>

            <section class="panel" aria-labelledby="visits-title">
              <div class="panel-head">
                <div class="panel-head-lead">
                  <h2 id="visits-title">Visits</h2>
                  {collecting ? null : <span class="stamp off">Off</span>}
                </div>
                <a
                  class="row-link"
                  href={`${routes.admin.history.index.href()}?client=${encodeURIComponent(client.id)}`}
                >
                  View in History
                  <Icon name="chevron" />
                </a>
              </div>
              <form
                class="panel-body"
                method="post"
                action={routes.admin.clients.historyCollection.href({
                  clientId: client.id,
                })}
              >
                <div class="form-foot">
                  <span>
                    History collection
                    {collecting ? <span class="hint"> On</span> : null}
                  </span>
                  <button
                    class="btn secondary"
                    type="submit"
                    name="enabled"
                    value={collecting ? "off" : "on"}
                  >
                    {collecting ? "Turn off" : "Turn on"}
                  </button>
                </div>
                <p class="hint">
                  {collecting
                    ? "This PC uploads Visits from Chrome, Edge, and Firefox."
                    : "Existing Visits stay until visit retention."}
                </p>
              </form>
              {visits.length === 0 ? (
                <p class="empty">
                  <strong>No Visits yet.</strong>
                </p>
              ) : (
                <VisitLog visits={visits} timeZone={timeZone} dayHeading="h3" foldRepeats />
              )}
            </section>

            <section class="panel" aria-labelledby="message-title">
              <div class="panel-head">
                <h2 id="message-title">Send a message</h2>
              </div>
              <form
                class="panel-body"
                method="post"
                action={routes.admin.messages.client.href({ clientId: client.id })}
              >
                <input type="hidden" name="returnTo" value={detailHref} />
                <label class="field">
                  <span class="visually-hidden">Message</span>
                  <textarea
                    name="content"
                    rows={3}
                    maxlength={500}
                    required
                    placeholder={`Shows on ${client.name}'s screen`}
                  ></textarea>
                </label>
                <div class="form-foot">
                  <span class="hint">
                    {connected ? "Shows on screen right away." : "It's offline, and messages aren't queued for later."}
                  </span>
                  <button class="btn" type="submit">
                    <Icon name="send" />
                    Send
                  </button>
                </div>
              </form>
            </section>
          </div>

          <div class="stack">
            <section class="panel" aria-labelledby="facts-title">
              <div class="panel-head">
                <h2 id="facts-title">About this PC</h2>
              </div>
              <dl class="facts panel-body">
                <dt>Status</dt>
                <dd>
                  <span class={`status ${connected ? "home" : "away"}`}>
                    {connected ? "Connected" : "Offline"}
                  </span>
                </dd>
                <dt>Last user</dt>
                <dd>{client.last_user ?? <span class="muted">Not reported</span>}</dd>
                <dt>Version</dt>
                <dd>
                  {client.lastSeenVersion ? (
                    <span class="data">v{client.lastSeenVersion}</span>
                  ) : (
                    <span class="muted">Unknown</span>
                  )}
                  {client.isStale ? (
                    <>
                      {" "}
                      <span class="tape warn">Update due</span>
                      {pinnedVersion ? (
                        <span class="hint"> Pinned version is v{pinnedVersion}.</span>
                      ) : null}
                    </>
                  ) : null}
                </dd>
                <dt>Client ID</dt>
                <dd class="data">{client.id}</dd>
              </dl>
            </section>

            <section class="panel" aria-labelledby="dns-title">
              <div class="panel-head">
                <h2 id="dns-title">DNS</h2>
                {dns && !dns.windowsDefault ? (
                  <span class={`stamp ${dns.status}`}>
                    {DNS_STATUS_LABEL[dns.status as DnsDirectiveStatus]}
                  </span>
                ) : null}
              </div>
              <div class="panel-body">
                {dns && !dns.windowsDefault ? (
                  <dl class="facts">
                    <dt>Last change</dt>
                    <dd>
                      {dns.directive_kind === "reset"
                        ? "Reset to automatic (DHCP)"
                        : `Profile ${dns.profile_name}`}
                    </dd>
                    {dns.primary_ip ? (
                      <>
                        <dt>Servers</dt>
                        <dd class="data">
                          {dns.primary_ip}
                          {dns.secondary_ip ? `, ${dns.secondary_ip}` : ""}
                        </dd>
                      </>
                    ) : null}
                    <dt>Sent</dt>
                    <dd>{formatTime(dns.issued_at)}</dd>
                    {dns.completed_at ? (
                      <>
                        <dt>Finished</dt>
                        <dd>{formatTime(dns.completed_at)}</dd>
                      </>
                    ) : null}
                    {dns.error ? (
                      <>
                        <dt>Error</dt>
                        <dd>{dns.error}</dd>
                      </>
                    ) : null}
                  </dl>
                ) : (
                  <p class="muted">Using whatever DNS Windows already had. No changes sent yet.</p>
                )}

                {dns?.overlayActive ? (
                  <div class="dns-overlay" data-dns-overlay>
                    <p
                      class="dns-remaining"
                      data-dns-remaining
                      data-deadline={dns.expires_at ?? ""}
                    >
                      {formatDnsRemaining(dns.remainingMs)}
                    </p>
                    <p class="hint" data-dns-restore-hint hidden>
                      Standing DNS should be back. Refresh to confirm.
                    </p>
                    <form
                      method="post"
                      action={routes.admin.clients.extendDns.href({ clientId: client.id })}
                    >
                      <div class="form-foot">
                        <span class="hint">Add time</span>
                        <div class="dns-extend-actions">
                          {DNS_OVERLAY_PRESET_MINUTES.map((minutes) => (
                            <button
                              class="btn secondary"
                              type="submit"
                              name="durationMinutes"
                              value={String(minutes)}
                            >
                              {minutes === 60 ? "1 hr" : `${minutes} min`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </form>
                  </div>
                ) : dns?.awaitingRestore ? (
                  <p class="hint">Standing DNS should be back. Refresh to confirm.</p>
                ) : null}

                <form
                  method="post"
                  action={routes.admin.clients.applyDns.href({ clientId: client.id })}
                >
                  <label class="field">
                    <span>Apply a profile</span>
                    <select name="profileId" required disabled={dnsProfiles.length === 0}>
                      <option value="">Choose a profile</option>
                      {dnsProfiles.map((profile) => (
                        <option value={profile.id}>
                          {profile.name} ({profile.primary_ip}
                          {profile.secondary_ip ? `, ${profile.secondary_ip}` : ""})
                        </option>
                      ))}
                    </select>
                  </label>
                  {overlayCapable && dnsProfiles.length > 0 ? (
                    <label class="field">
                      <span>Time limit</span>
                      <select name="durationMinutes">
                        <option value="">Until I change it</option>
                        {DNS_OVERLAY_PRESET_MINUTES.map((minutes) => (
                          <option value={String(minutes)}>
                            {minutes === 60 ? "1 hour" : `${minutes} minutes`}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div class="form-foot">
                    {dnsProfiles.length === 0 ? (
                      <a class="hint" href={routes.admin.settings.dnsProfiles.index.href()}>
                        Create a DNS profile first
                      </a>
                    ) : overlayCapable ? (
                      <span class="hint">
                        A time limit starts when you apply, even if this PC is offline.
                      </span>
                    ) : (
                      <span class="hint">
                        Time limits need client v{overlayMinVersion} or newer. Apply stays until you
                        change it.
                      </span>
                    )}
                    <button class="btn" type="submit" disabled={dnsProfiles.length === 0}>
                      Apply
                    </button>
                  </div>
                </form>

                <form
                  method="post"
                  action={routes.admin.clients.resetDns.href({ clientId: client.id })}
                >
                  <div class="form-foot">
                    <span class="hint">Go back to the router's DNS servers.</span>
                    <button class="btn secondary" type="submit">
                      Reset to automatic
                    </button>
                  </div>
                </form>
              </div>
            </section>

            <section class="panel danger-zone" aria-labelledby="danger-title">
              <div class="panel-head">
                <h2 id="danger-title">Danger zone</h2>
              </div>
              <div class="panel-body">
                <details class="disclose">
                  <summary>
                    <Icon name="chevron" />
                    Clear History for {client.name}
                  </summary>
                  <form
                    class="disclose-body"
                    method="post"
                    action={routes.admin.clients.clearHistory.href({ clientId: client.id })}
                  >
                    <p class="muted">
                      Deletes every stored Visit for this PC. New Visits still appear.
                    </p>
                    <div class="form-foot">
                      <span></span>
                      <button class="btn danger" type="submit">
                        Clear History for {client.name}
                      </button>
                    </div>
                  </form>
                </details>
                <details class="disclose">
                  <summary>
                    <Icon name="chevron" />
                    Remove {client.name} from FamilyPrism
                  </summary>
                  <form
                    class="disclose-body"
                    method="post"
                    action={routes.admin.clients.delete.href({ clientId: client.id })}
                  >
                    <p class="muted">
                      Disconnects the PC, revokes its credential, and deletes its screenshot.
                      To manage it again, reinstall the agent and register it from scratch.
                    </p>
                    <div class="form-foot">
                      <span></span>
                      <button class="btn danger" type="submit">
                        Unregister {client.name}
                      </button>
                    </div>
                  </form>
                </details>
              </div>
            </section>
          </div>
        </div>
      </AdminShell>
    );
  };
}

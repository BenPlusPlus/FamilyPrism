import type { Handle } from "remix/ui";

import { getClient } from "../../data/clients.ts";
import { getLatestDnsState } from "../../data/dns-directives.ts";
import { listDnsProfiles } from "../../data/dns-profiles.ts";
import { connectionRegistry } from "../../realtime/registry.ts";
import { routes } from "../../routes.ts";
import { Layout } from "../../ui/layout.tsx";
import { getNotice } from "../../utils/notice.ts";
import { renderNotice } from "./notice.tsx";

export function ClientDetailPage(
  handle: Handle<{
    client: NonNullable<Awaited<ReturnType<typeof getClient>>>;
    dnsProfiles: Awaited<ReturnType<typeof listDnsProfiles>>;
    latestDnsState: Awaited<ReturnType<typeof getLatestDnsState>>;
    notice: ReturnType<typeof getNotice>;
  }>,
) {
  let screenshotUrl = routes.admin.clients.screenshot.href({
    clientId: handle.props.client.id,
  });

  return () => (
    <Layout title={handle.props.client.name}>
      <h1>{handle.props.client.name}</h1>
      <p>
        <a href={routes.admin.clients.index.href()}>Back to clients</a>
      </p>
      {handle.props.notice ? renderNotice(handle.props.notice) : null}

      <section class="card stack">
        <p>
          <strong>Client ID:</strong> <code>{handle.props.client.id}</code>
        </p>
        <p>
          <strong>Last user:</strong> {handle.props.client.last_user ?? "—"}
        </p>
        <p>
          <strong>Status:</strong>{" "}
          {connectionRegistry.isClientConnected(handle.props.client.id)
            ? "Connected"
            : "Offline"}
        </p>
        <form
          method="post"
          action={routes.admin.screenshots.client.href({
            clientId: handle.props.client.id,
          })}
        >
          <button type="submit">Take screenshot</button>
        </form>
      </section>

      <section class="card stack">
        <h2>Latest screenshot</h2>
        {handle.props.client.last_screenshot_at ? (
          <>
            <p>
              Captured at{" "}
              {new Date(handle.props.client.last_screenshot_at).toLocaleString()}.
            </p>
            <img
              src={screenshotUrl}
              alt={`Latest screenshot from ${handle.props.client.name}`}
            />
          </>
        ) : (
          <p>No screenshot has been uploaded yet.</p>
        )}
      </section>

      <section class="card stack">
        <h2>DNS directive</h2>
        <p>
          Apply a named DNS resolver profile to all active IPv4 adapters, or
          reset the client to DHCP-provided DNS servers.
        </p>
        <div class="card-grid">
          <form
            method="post"
            action={routes.admin.clients.applyDns.href({
              clientId: handle.props.client.id,
            })}
            class="stack"
          >
            <label>
              DNS profile
              <select name="profileId" required>
                <option value="">Choose a profile</option>
                {handle.props.dnsProfiles.map((profile) => (
                  <option value={profile.id}>
                    {profile.name} ({profile.primary_ip}
                    {profile.secondary_ip ? `, ${profile.secondary_ip}` : ""})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={handle.props.dnsProfiles.length === 0}>
              Apply DNS profile
            </button>
            {handle.props.dnsProfiles.length === 0 ? (
              <p>
                <a href={routes.admin.settings.dnsProfiles.index.href()}>
                  Create a DNS profile first
                </a>
                .
              </p>
            ) : null}
          </form>

          <form
            method="post"
            action={routes.admin.clients.resetDns.href({
              clientId: handle.props.client.id,
            })}
            class="stack"
          >
            <h3>Reset to DHCP</h3>
            <p>Clear static DNS servers and let Windows use DHCP DNS again.</p>
            <button type="submit">Reset DNS to DHCP</button>
          </form>
        </div>

        {handle.props.latestDnsState ? (
          <div class="card">
            <p>
              <strong>Status:</strong> {handle.props.latestDnsState.status}
            </p>
            <p>
              <strong>Command:</strong>{" "}
              <code>{handle.props.latestDnsState.command_id}</code>
            </p>
            <p>
              <strong>Directive:</strong>{" "}
              {handle.props.latestDnsState.directive_kind === "reset"
                ? "Reset to DHCP"
                : handle.props.latestDnsState.profile_name}
            </p>
            {handle.props.latestDnsState.primary_ip ? (
              <p>
                <strong>DNS servers:</strong>{" "}
                <code>{handle.props.latestDnsState.primary_ip}</code>
                {handle.props.latestDnsState.secondary_ip ? (
                  <>
                    {", "}
                    <code>{handle.props.latestDnsState.secondary_ip}</code>
                  </>
                ) : null}
              </p>
            ) : null}
            <p>
              <strong>Issued:</strong>{" "}
              {new Date(handle.props.latestDnsState.issued_at).toLocaleString()}
            </p>
            {handle.props.latestDnsState.completed_at ? (
              <p>
                <strong>Completed:</strong>{" "}
                {new Date(
                  handle.props.latestDnsState.completed_at,
                ).toLocaleString()}
              </p>
            ) : null}
            {handle.props.latestDnsState.error ? (
              <p>
                <strong>Error:</strong> {handle.props.latestDnsState.error}
              </p>
            ) : null}
          </div>
        ) : (
          <p>No DNS directive has been issued to this client yet.</p>
        )}
      </section>
    </Layout>
  );
}

import type { Controller } from "remix/fetch-router";
import { Auth, requireAuth } from "remix/auth-middleware";
import * as s from "remix/data-schema";
import * as f from "remix/data-schema/form-data";
import { maxLength, minLength } from "remix/data-schema/checks";
import { redirect } from "remix/response/redirect";
import type { Handle } from "remix/ui";

import type { AdminIdentity } from "../../../data/auth.ts";
import {
  createDnsProfile,
  deleteDnsProfile,
  DnsProfileNameConflictError,
  InvalidDnsProfileError,
  listDnsProfiles,
  updateDnsProfile,
} from "../../../data/dns-profiles.ts";
import { requireAdmin } from "../../../middleware/admin.ts";
import type { AppContext } from "../../../router.ts";
import { routes } from "../../../routes.ts";
import { Layout } from "../../../ui/layout.tsx";
import { getNotice, withNotice } from "../../../utils/notice.ts";
import { render } from "../../../utils/render.tsx";

let dnsProfileSchema = f.object({
  name: f.field(s.string().pipe(minLength(1), maxLength(100))),
  primaryIp: f.field(s.string().pipe(minLength(1), maxLength(45))),
  secondaryIp: f.field(s.string().pipe(maxLength(45))),
});

let adminSettingsMiddleware = [
  requireAuth<AdminIdentity>({
    onFailure() {
      return redirect(routes.auth.login.index.href());
    },
  }),
  requireAdmin(),
];

function dnsProfilesIndexHref() {
  return routes.admin.settings.dnsProfiles.index.href();
}

function parseDnsProfileForm(get: AppContext["get"]) {
  let parsed = s.parseSafe(dnsProfileSchema, get(FormData));
  if (!parsed.success) {
    throw new InvalidDnsProfileError(
      parsed.issues[0]?.message ?? "Invalid DNS profile payload.",
    );
  }

  return parsed.value;
}

function dnsProfileErrorNotice(error: unknown) {
  if (
    error instanceof DnsProfileNameConflictError ||
    error instanceof InvalidDnsProfileError
  ) {
    return error.message;
  }

  throw error;
}

export const adminSettings = {
  middleware: adminSettingsMiddleware,
  actions: {
    async index({ request }) {
      return render(
        <SettingsIndexPage notice={getNotice(new URL(request.url))} />,
        request,
      );
    },
  },
} satisfies Controller<typeof routes.admin.settings, AppContext>;

export const adminSettingsDnsProfiles = {
  middleware: adminSettingsMiddleware,
  actions: {
    async index({ request }) {
      let profiles = await listDnsProfiles();

      return render(
        <DnsProfilesPage
          notice={getNotice(new URL(request.url))}
          profiles={profiles}
        />,
        request,
      );
    },

    async create({ get, request }) {
      try {
        let payload = parseDnsProfileForm(get);
        await createDnsProfile(payload);
      } catch (error) {
        return redirect(
          withNotice(request, dnsProfilesIndexHref(), {
            text: dnsProfileErrorNotice(error),
            type: "error",
          }),
        );
      }

      return redirect(
        withNotice(request, dnsProfilesIndexHref(), {
          text: "DNS profile created.",
          type: "success",
        }),
      );
    },

    async update({ get, params, request }) {
      try {
        let payload = parseDnsProfileForm(get);
        let profile = await updateDnsProfile(params.profileId, payload);

        if (!profile) {
          return redirect(
            withNotice(request, dnsProfilesIndexHref(), {
              text: "DNS profile not found.",
              type: "error",
            }),
          );
        }
      } catch (error) {
        return redirect(
          withNotice(request, dnsProfilesIndexHref(), {
            text: dnsProfileErrorNotice(error),
            type: "error",
          }),
        );
      }

      return redirect(
        withNotice(request, dnsProfilesIndexHref(), {
          text: "DNS profile updated.",
          type: "success",
        }),
      );
    },

    async delete({ params, request }) {
      let profile = await deleteDnsProfile(params.profileId);

      if (!profile) {
        return redirect(
          withNotice(request, dnsProfilesIndexHref(), {
            text: "DNS profile not found.",
            type: "error",
          }),
        );
      }

      return redirect(
        withNotice(request, dnsProfilesIndexHref(), {
          text: "DNS profile deleted.",
          type: "success",
        }),
      );
    },
  },
} satisfies Controller<typeof routes.admin.settings.dnsProfiles, AppContext>;

function SettingsIndexPage(
  handle: Handle<{
    notice: ReturnType<typeof getNotice>;
  }>,
) {
  return () => (
    <Layout title="Settings">
      <h1>Settings</h1>
      <p>Configure reusable controls that can be applied to managed clients.</p>
      {handle.props.notice ? renderNotice(handle.props.notice) : null}

      <section class="card-grid">
        <article class="card stack">
          <h2>DNS profiles</h2>
          <p>
            Create named IPv4 DNS server profiles, then apply them from a
            client's detail page.
          </p>
          <a href={dnsProfilesIndexHref()}>Manage DNS profiles</a>
        </article>
      </section>
    </Layout>
  );
}

function DnsProfilesPage(
  handle: Handle<{
    notice: ReturnType<typeof getNotice>;
    profiles: Awaited<ReturnType<typeof listDnsProfiles>>;
  }>,
) {
  return () => (
    <Layout title="DNS profiles">
      <h1>DNS profiles</h1>
      <p>
        Named resolver profiles for client-side DNS directives. Profiles are
        snapshots when applied, so future edits will not rewrite an already
        issued command.
      </p>
      <p>
        <a href={routes.admin.settings.index.href()}>Back to settings</a>
      </p>
      {handle.props.notice ? renderNotice(handle.props.notice) : null}

      <section class="card stack">
        <h2>Create profile</h2>
        <form method="post" action={routes.admin.settings.dnsProfiles.create.href()} class="stack">
          <label>
            Name
            <input type="text" name="name" required maxlength={100} />
          </label>
          <label>
            Primary DNS server
            <input type="text" name="primaryIp" placeholder="1.1.1.1" required />
          </label>
          <label>
            Secondary DNS server
            <input type="text" name="secondaryIp" placeholder="1.0.0.1" />
          </label>
          <button type="submit">Create DNS profile</button>
        </form>
      </section>

      <div class="stack">
        {handle.props.profiles.length === 0 ? (
          <section class="card">
            <p>No DNS profiles have been created yet.</p>
          </section>
        ) : null}

        {handle.props.profiles.map((profile) => (
          <section class="card stack">
            <h2>{profile.name}</h2>
            <p>
              <strong>Primary:</strong> <code>{profile.primary_ip}</code>
              {profile.secondary_ip ? (
                <>
                  {" "}
                  <strong>Secondary:</strong>{" "}
                  <code>{profile.secondary_ip}</code>
                </>
              ) : null}
            </p>
            <div class="card-grid">
              <form
                method="post"
                action={routes.admin.settings.dnsProfiles.update.href({
                  profileId: profile.id,
                })}
                class="stack"
              >
                <h3>Edit profile</h3>
                <label>
                  Name
                  <input
                    type="text"
                    name="name"
                    value={profile.name}
                    required
                    maxlength={100}
                  />
                </label>
                <label>
                  Primary DNS server
                  <input
                    type="text"
                    name="primaryIp"
                    value={profile.primary_ip}
                    required
                  />
                </label>
                <label>
                  Secondary DNS server
                  <input
                    type="text"
                    name="secondaryIp"
                    value={profile.secondary_ip ?? ""}
                  />
                </label>
                <button type="submit">Save profile</button>
              </form>

              <form
                method="post"
                action={routes.admin.settings.dnsProfiles.delete.href({
                  profileId: profile.id,
                })}
              >
                <button type="submit">Delete profile</button>
              </form>
            </div>
          </section>
        ))}
      </div>
    </Layout>
  );
}

function renderNotice(notice: NonNullable<ReturnType<typeof getNotice>>) {
  return (
    <div class={`notice ${notice.type}`}>
      <strong>{notice.type === "error" ? "Error" : "Success"}:</strong>{" "}
      {notice.text}
    </div>
  );
}

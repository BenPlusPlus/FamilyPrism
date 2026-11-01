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
import { Icon } from "../../../ui/icons.tsx";
import { AdminShell } from "../../../ui/layout.tsx";
import { NoticeBar } from "../../../ui/notice.tsx";
import { getNotice, withNotice, type Notice } from "../../../utils/notice.ts";
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

function adminName(get: AppContext["get"]) {
  let auth = get(Auth);
  return auth.ok ? (auth.identity as AdminIdentity).user.name : "";
}

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
    async index({ get, request }) {
      return render(
        <SettingsIndexPage
          adminName={adminName(get)}
          notice={getNotice(new URL(request.url))}
        />,
        request,
      );
    },
  },
} satisfies Controller<typeof routes.admin.settings, AppContext>;

export const adminSettingsDnsProfiles = {
  middleware: adminSettingsMiddleware,
  actions: {
    async index({ get, request }) {
      let profiles = await listDnsProfiles();

      return render(
        <DnsProfilesPage
          adminName={adminName(get)}
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
    adminName: string;
    notice: Notice | null;
  }>,
) {
  return () => (
    <AdminShell active="dns" title="Settings" adminName={handle.props.adminName}>
      <header class="page-head">
        <div>
          <h1>Settings</h1>
          <p>Reusable controls you can apply to any PC.</p>
        </div>
      </header>
      <NoticeBar notice={handle.props.notice} />
      <section class="panel">
        <ul class="rows">
          <li>
            <a class="row-link" href={dnsProfilesIndexHref()}>
              DNS profiles
              <Icon name="chevron" />
            </a>
            <span class="muted">
              Named DNS server pairs, applied from a PC's page.
            </span>
          </li>
        </ul>
      </section>
    </AdminShell>
  );
}

function DnsProfileFields() {
  return ({
    profile,
  }: {
    profile?: { name: string; primary_ip: string; secondary_ip: string | null };
  }) => (
    <>
      <label class="field">
        <span>Name</span>
        <input
          type="text"
          name="name"
          required
          maxlength={100}
          value={profile?.name ?? ""}
          placeholder="Family filter"
        />
      </label>
      <div class="form-row">
        <label class="field">
          <span>Primary server</span>
          <input
            class="mono"
            type="text"
            name="primaryIp"
            required
            maxlength={45}
            inputmode="decimal"
            value={profile?.primary_ip ?? ""}
            placeholder="1.1.1.3"
          />
        </label>
        <label class="field">
          <span>Secondary server</span>
          <input
            class="mono"
            type="text"
            name="secondaryIp"
            maxlength={45}
            inputmode="decimal"
            value={profile?.secondary_ip ?? ""}
            placeholder="Optional"
          />
        </label>
      </div>
    </>
  );
}

function DnsProfilesPage(
  handle: Handle<{
    adminName: string;
    notice: Notice | null;
    profiles: Awaited<ReturnType<typeof listDnsProfiles>>;
  }>,
) {
  return () => {
    let { adminName, notice, profiles } = handle.props;

    return (
      <AdminShell active="dns" title="DNS profiles" adminName={adminName}>
        <header class="page-head">
          <div>
            <h1>DNS profiles</h1>
            <p>
              Named DNS servers you can apply to a PC from its page. Editing a
              profile doesn't change PCs it was already sent to.
            </p>
          </div>
        </header>

        <NoticeBar notice={notice} />

        <div class="split">
          <section class="panel" aria-labelledby="profiles-title">
            <div class="panel-head">
              <h2 id="profiles-title">Profiles</h2>
              <span class="count">{profiles.length}</span>
            </div>
            {profiles.length === 0 ? (
              <p class="empty">
                <strong>No profiles yet.</strong>
                Create one, for example a family-safe filter, then apply it from a PC's page.
              </p>
            ) : (
              profiles.map((profile) => (
                <article class="group">
                  <div class="group-head">
                    <h3>{profile.name}</h3>
                    <span class="data">
                      {profile.primary_ip}
                      {profile.secondary_ip ? `, ${profile.secondary_ip}` : ""}
                    </span>
                  </div>
                  <details class="disclose">
                    <summary>
                      <Icon name="chevron" />
                      Edit or delete
                    </summary>
                    <div class="disclose-body stack">
                      <form
                        method="post"
                        action={routes.admin.settings.dnsProfiles.update.href({
                          profileId: profile.id,
                        })}
                      >
                        <DnsProfileFields profile={profile} />
                        <div class="form-foot">
                          <span></span>
                          <button class="btn secondary" type="submit">
                            Save changes
                          </button>
                        </div>
                      </form>
                      <form
                        method="post"
                        action={routes.admin.settings.dnsProfiles.delete.href({
                          profileId: profile.id,
                        })}
                      >
                        <div class="form-foot">
                          <span class="hint">PCs already using it keep their settings.</span>
                          <button class="btn danger" type="submit">
                            Delete {profile.name}
                          </button>
                        </div>
                      </form>
                    </div>
                  </details>
                </article>
              ))
            )}
          </section>

          <section class="panel" aria-labelledby="new-profile-title">
            <div class="panel-head">
              <h2 id="new-profile-title">New profile</h2>
            </div>
            <form
              class="panel-body"
              method="post"
              action={routes.admin.settings.dnsProfiles.create.href()}
            >
              <DnsProfileFields />
              <div class="form-foot">
                <span class="hint">IPv4 addresses.</span>
                <button class="btn" type="submit">
                  <Icon name="plus" />
                  Create profile
                </button>
              </div>
            </form>
          </section>
        </div>
      </AdminShell>
    );
  };
}

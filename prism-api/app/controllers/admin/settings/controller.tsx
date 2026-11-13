import type { Controller } from "remix/router";
import * as s from "remix/data-schema";
import * as f from "remix/data-schema/form-data";
import { maxLength, minLength } from "remix/data-schema/checks";
import { redirect } from "remix/response/redirect";
import type { Handle } from "remix/component";

import {
  createDnsProfile,
  deleteDnsProfile,
  DnsProfileNameConflictError,
  InvalidDnsProfileError,
  listDnsProfiles,
  NO_INTERNET_PROFILE,
  updateDnsProfile,
} from "../../../data/dns-profiles.ts";
import {
  getHouseholdTimeZone,
  InvalidTimeZoneError,
  setHouseholdTimeZone,
} from "../../../data/household-settings.ts";
import {
  getVisitRetentionDays,
  InvalidVisitRetentionError,
  MAX_VISIT_RETENTION_DAYS,
  MIN_VISIT_RETENTION_DAYS,
  setVisitRetentionDays,
} from "../../../data/visits.ts";
import {
  getConsoleViewer,
  requireConsoleAccount,
  requireConsoleAdmin,
} from "../../../middleware/console.ts";
import type { AppContext } from "../../../router.ts";
import { routes } from "../../../routes.ts";
import { Icon } from "../../../ui/icons.tsx";
import { AdminShell, viewerFrom, type Viewer } from "../../../ui/layout.tsx";
import { NoticeBar } from "../../../ui/notice.tsx";
import { getNotice, withNotice, type Notice } from "../../../utils/notice.ts";
import { render } from "../../../utils/render.tsx";
import { timeZoneChoices } from "../../../utils/time-zone.ts";

let dnsProfileSchema = f.object({
  name: f.field(s.string().pipe(minLength(1), maxLength(100))),
  primaryIp: f.field(s.string().pipe(minLength(1), maxLength(45))),
  secondaryIp: f.field(s.string().pipe(maxLength(45))),
});

export const adminSettingsMiddleware = [...requireConsoleAccount(), requireConsoleAdmin()];

function viewer(get: AppContext["get"]) {
  return viewerFrom(getConsoleViewer({ get }));
}

function settingsIndexHref() {
  return routes.admin.settings.index.href();
}

function dnsProfilesIndexHref() {
  return routes.admin.settings.dnsProfiles.index.href();
}

function parseDnsProfileForm(get: AppContext["get"]) {
  let parsed = s.parseSafe(dnsProfileSchema, get(FormData));
  if (!parsed.success) {
    throw new InvalidDnsProfileError(
      parsed.issues[0]?.message ?? "Invalid internet profile.",
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
      let [visitRetentionDays, timeZone] = await Promise.all([
        getVisitRetentionDays(),
        getHouseholdTimeZone(),
      ]);

      return render(
        <SettingsIndexPage
          viewer={viewer(get)}
          notice={getNotice(new URL(request.url))}
          timeZone={timeZone}
          visitRetentionDays={visitRetentionDays}
        />,
        request,
      );
    },

    async timeZone({ get, request }) {
      try {
        await setHouseholdTimeZone(get(FormData).get("timeZone"));
      } catch (error) {
        if (!(error instanceof InvalidTimeZoneError)) {
          throw error;
        }

        return redirect(
          withNotice(request, settingsIndexHref(), {
            text: error.message,
            type: "error",
          }),
        );
      }

      return redirect(
        withNotice(request, settingsIndexHref(), {
          text: "Time zone saved.",
          type: "success",
        }),
      );
    },

    async visitRetention({ get, request }) {
      try {
        await setVisitRetentionDays(get(FormData).get("visitRetentionDays"));
      } catch (error) {
        if (!(error instanceof InvalidVisitRetentionError)) {
          throw error;
        }

        return redirect(
          withNotice(request, settingsIndexHref(), {
            text: error.message,
            type: "error",
          }),
        );
      }

      return redirect(
        withNotice(request, settingsIndexHref(), {
          text: "Visit retention saved.",
          type: "success",
        }),
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
          viewer={viewer(get)}
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
          text: "Internet profile created.",
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
              text: "Internet profile not found.",
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
          text: "Internet profile updated.",
          type: "success",
        }),
      );
    },

    async delete({ params, request }) {
      let profile = await deleteDnsProfile(params.profileId);

      if (!profile) {
        return redirect(
          withNotice(request, dnsProfilesIndexHref(), {
            text: "Internet profile not found.",
            type: "error",
          }),
        );
      }

      return redirect(
        withNotice(request, dnsProfilesIndexHref(), {
          text: "Internet profile deleted.",
          type: "success",
        }),
      );
    },
  },
} satisfies Controller<typeof routes.admin.settings.dnsProfiles, AppContext>;

function SettingsIndexPage(
  handle: Handle<{
    viewer: Viewer;
    notice: Notice | null;
    timeZone: string;
    visitRetentionDays: number;
  }>,
) {
  return () => (
    <AdminShell active="dns" title="Settings" viewer={handle.props.viewer}>
      <header class="page-head">
        <div>
          <h1>Settings</h1>
          <p>Household controls, including internet profiles you can apply to any PC.</p>
        </div>
      </header>
      <NoticeBar notice={handle.props.notice} />
      <section class="panel" aria-labelledby="time-zone-title">
        <div class="panel-head">
          <h2 id="time-zone-title">Time zone</h2>
        </div>
        <form
          class="panel-body"
          method="post"
          action={routes.admin.settings.timeZone.href()}
        >
          <label class="field">
            <span>Zone</span>
            <select name="timeZone" required>
              {timeZoneChoices(handle.props.timeZone).map((zone) => (
                <option value={zone} selected={zone === handle.props.timeZone}>
                  {zone.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <div class="form-foot">
            <span class="hint">
              Visit times, Today and Yesterday, and other dates follow this zone.
            </span>
            <button class="btn" type="submit">
              Save
            </button>
          </div>
        </form>
      </section>
      <section class="panel" aria-labelledby="visit-retention-title">
        <div class="panel-head">
          <h2 id="visit-retention-title">Visit retention</h2>
        </div>
        <form
          class="panel-body"
          method="post"
          action={routes.admin.settings.visitRetention.href()}
        >
          <label class="field">
            <span>Days</span>
            <input
              type="number"
              name="visitRetentionDays"
              required
              min={MIN_VISIT_RETENTION_DAYS}
              max={MAX_VISIT_RETENTION_DAYS}
              step={1}
              value={String(handle.props.visitRetentionDays)}
            />
          </label>
          <div class="form-foot">
            <span class="hint">
              How long to keep each Visit, counted from the visit time.
            </span>
            <button class="btn" type="submit">
              Save
            </button>
          </div>
        </form>
      </section>
      <section class="panel">
        <ul class="rows">
          <li>
            <a class="row-link" href={routes.admin.settings.accounts.index.href()}>
              Accounts
              <Icon name="chevron" />
            </a>
            <span class="muted">
              Who can sign in to the console, and whether they're an admin or a parent.
            </span>
          </li>
          <li>
            <a class="row-link" href={dnsProfilesIndexHref()}>
              Internet profiles
              <Icon name="chevron" />
            </a>
            <span class="muted">
              No internet, plus filtering profiles you name, applied from a PC's page.
            </span>
          </li>
        </ul>
      </section>
    </AdminShell>
  );
}

function DnsProfileFields(
  handle: Handle<{
    profile?: { name: string; primary_ip: string; secondary_ip: string | null };
  }>,
) {
  return () => (
    <>
      <label class="field">
        <span>Name</span>
        <input
          type="text"
          name="name"
          required
          maxlength={100}
          value={handle.props.profile?.name ?? ""}
          placeholder="Family filter"
        />
      </label>
      <div class="form-row">
        <label class="field">
          <span>Primary DNS server</span>
          <input
            class="mono"
            type="text"
            name="primaryIp"
            required
            maxlength={45}
            inputmode="decimal"
            value={handle.props.profile?.primary_ip ?? ""}
            placeholder="1.1.1.3"
          />
        </label>
        <label class="field">
          <span>Secondary DNS server</span>
          <input
            class="mono"
            type="text"
            name="secondaryIp"
            maxlength={45}
            inputmode="decimal"
            value={handle.props.profile?.secondary_ip ?? ""}
            placeholder="Optional"
          />
        </label>
      </div>
    </>
  );
}

function DnsProfilesPage(
  handle: Handle<{
    viewer: Viewer;
    notice: Notice | null;
    profiles: Awaited<ReturnType<typeof listDnsProfiles>>;
  }>,
) {
  return () => {
    let { viewer, notice, profiles } = handle.props;

    return (
      <AdminShell active="dns" title="Internet profiles" viewer={viewer}>
        <header class="page-head">
          <div>
            <h1>Internet profiles</h1>
            <p>
              Profiles you can apply to a PC from its page. Each one you add names a pair of DNS
              servers, such as a family-safe filter. Editing a profile doesn't change PCs it was
              already sent to.
            </p>
          </div>
        </header>

        <NoticeBar notice={notice} />

        <div class="split">
          <section class="panel" aria-labelledby="profiles-title">
            <div class="panel-head">
              <h2 id="profiles-title">Profiles</h2>
              <span class="count">{profiles.length + 1}</span>
            </div>
            <article class="group">
              <div class="group-head">
                <h3>{NO_INTERNET_PROFILE.name}</h3>
                <span class="muted">Built in</span>
              </div>
              <p class="muted">
                Blocks the internet but keeps the home network and FamilyPrism reachable. It can't
                be edited or deleted.
              </p>
            </article>
            {profiles.length === 0 ? (
              <p class="empty">
                <strong>No profiles of your own yet.</strong>
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

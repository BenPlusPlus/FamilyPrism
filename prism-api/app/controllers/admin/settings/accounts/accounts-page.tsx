import type { Handle } from "remix/component";

import {
  CONSOLE_ROLE_LABEL,
  CONSOLE_ROLES,
  type ConsoleAccountView,
  type ConsoleRole,
} from "../../../../data/console-accounts.ts";
import {
  CONSOLE_INVITATION_DAYS,
  type ConsoleInvitationRow,
} from "../../../../data/console-invitations.ts";
import { routes } from "../../../../routes.ts";
import { Icon } from "../../../../ui/icons.tsx";
import { AdminShell, type Viewer } from "../../../../ui/layout.tsx";
import { NoticeBar } from "../../../../ui/notice.tsx";
import type { Notice } from "../../../../utils/notice.ts";
import { formatDateTime } from "../../../../utils/time-zone.ts";

const CONSOLE_ROLE_SUMMARY: Record<ConsoleRole, string> = {
  admin:
    "Everything a parent can do, plus Settings, DNS profiles, Groups, Accounts, and deleting History or PCs.",
  parent:
    "Sees every PC and its History, takes screenshots, sends messages, and applies or resets DNS. Can't change settings or delete anything.",
};

export interface CreatedInvite {
  email: string;
  url: string;
}

function RoleSelect(handle: Handle<{ selected: ConsoleRole }>) {
  return () => (
    <select name="role" required>
      {CONSOLE_ROLES.map((role) => (
        <option value={role} selected={role === handle.props.selected}>
          {CONSOLE_ROLE_LABEL[role]}
        </option>
      ))}
    </select>
  );
}

export function AccountsPage(
  handle: Handle<{
    accounts: ConsoleAccountView[];
    createdInvite: CreatedInvite | null;
    invitations: ConsoleInvitationRow[];
    notice: Notice | null;
    timeZone: string;
    viewer: Viewer;
    viewerUserId: string;
  }>,
) {
  return () => {
    let { accounts, createdInvite, invitations, notice, timeZone, viewer, viewerUserId } =
      handle.props;

    return (
      <AdminShell active="dns" title="Accounts" viewer={viewer}>
        <a class="crumb" href={routes.admin.settings.index.href()}>
          <Icon name="back" />
          Settings
        </a>

        <header class="page-head">
          <div>
            <h1>Accounts</h1>
            <p>Everyone who can sign in to this console. Role changes apply on their next click.</p>
          </div>
        </header>

        <NoticeBar notice={notice} />

        {createdInvite ? (
          <section class="panel" aria-labelledby="invite-link-title">
            <div class="panel-head">
              <h2 id="invite-link-title">Invite link for {createdInvite.email}</h2>
            </div>
            <div class="panel-body">
              <label class="field">
                <span>Link</span>
                <input class="mono" type="text" readonly value={createdInvite.url} />
              </label>
              <p class="hint">
                Copy it now and send it to them yourself. It isn't shown again, works once, and
                expires in {CONSOLE_INVITATION_DAYS} days.
              </p>
            </div>
          </section>
        ) : null}

        <div class="split">
          <div class="stack">
            <section class="panel" aria-labelledby="accounts-title">
              <div class="panel-head">
                <h2 id="accounts-title">Accounts</h2>
                <span class="count">{accounts.length}</span>
              </div>
              {accounts.map((account) => (
                <article class="group">
                  <div class="group-head">
                    <h3>{account.name}</h3>
                    <span class="tape">{CONSOLE_ROLE_LABEL[account.role]}</span>
                  </div>
                  <p class="muted">{account.email}</p>
                  {account.userId === viewerUserId ? (
                    <p class="hint">This is you. Another admin can change your role.</p>
                  ) : (
                    <details class="disclose">
                      <summary>
                        <Icon name="chevron" />
                        Change role or remove
                      </summary>
                      <div class="disclose-body stack">
                        <form
                          method="post"
                          action={routes.admin.settings.accounts.role.href({
                            userId: account.userId,
                          })}
                        >
                          <label class="field">
                            <span>Role</span>
                            <RoleSelect selected={account.role} />
                          </label>
                          <div class="form-foot">
                            <span></span>
                            <button class="btn secondary" type="submit">
                              Save role
                            </button>
                          </div>
                        </form>
                        <form
                          method="post"
                          action={routes.admin.settings.accounts.remove.href({
                            userId: account.userId,
                          })}
                        >
                          <div class="form-foot">
                            <span class="hint">
                              Signs them out for good. Messages they sent stay.
                            </span>
                            <button class="btn danger" type="submit">
                              Remove {account.name}
                            </button>
                          </div>
                        </form>
                      </div>
                    </details>
                  )}
                </article>
              ))}
            </section>

            {invitations.length > 0 ? (
              <section class="panel" aria-labelledby="invites-title">
                <div class="panel-head">
                  <h2 id="invites-title">Pending invites</h2>
                  <span class="count">{invitations.length}</span>
                </div>
                {invitations.map((invitation) => (
                  <article class="group">
                    <div class="group-head">
                      <h3>{invitation.name}</h3>
                      <span class="tape">{CONSOLE_ROLE_LABEL[invitation.role]}</span>
                    </div>
                    <p class="muted">
                      {invitation.email} · Expires {formatDateTime(invitation.expires_at, timeZone)}
                    </p>
                    <form
                      method="post"
                      action={routes.admin.settings.accounts.revokeInvite.href({
                        inviteId: invitation.id,
                      })}
                    >
                      <div class="form-foot">
                        <span class="hint">
                          Lost the link? Invite the same email again for a new one.
                        </span>
                        <button class="btn secondary" type="submit">
                          Revoke
                        </button>
                      </div>
                    </form>
                  </article>
                ))}
              </section>
            ) : null}
          </div>

          <section class="panel" aria-labelledby="invite-title">
            <div class="panel-head">
              <h2 id="invite-title">Invite someone</h2>
            </div>
            <form
              class="panel-body"
              method="post"
              action={routes.admin.settings.accounts.invite.href()}
            >
              <label class="field">
                <span>Name</span>
                <input type="text" name="name" required maxlength={100} autocomplete="off" />
              </label>
              <label class="field">
                <span>Email</span>
                <input type="email" name="email" required autocomplete="off" />
              </label>
              <label class="field">
                <span>Role</span>
                <RoleSelect selected="parent" />
              </label>
              <dl class="facts">
                {CONSOLE_ROLES.map((role) => (
                  <>
                    <dt>{CONSOLE_ROLE_LABEL[role]}</dt>
                    <dd class="hint">{CONSOLE_ROLE_SUMMARY[role]}</dd>
                  </>
                ))}
              </dl>
              <div class="form-foot">
                <span class="hint">You get a link to send them. Nothing is emailed.</span>
                <button class="btn" type="submit">
                  <Icon name="plus" />
                  Create invite link
                </button>
              </div>
            </form>
          </section>
        </div>
      </AdminShell>
    );
  };
}

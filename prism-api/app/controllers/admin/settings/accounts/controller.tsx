import type { Controller } from "remix/router";
import * as s from "remix/data-schema";
import * as f from "remix/data-schema/form-data";
import { email, maxLength, minLength } from "remix/data-schema/checks";
import { redirect } from "remix/response/redirect";

import { getEnv } from "../../../../config/env.ts";
import {
  CONSOLE_ROLE_LABEL,
  LastConsoleAdminError,
  listConsoleAccounts,
  parseConsoleRole,
  removeConsoleAccount,
  setConsoleRole,
} from "../../../../data/console-accounts.ts";
import {
  ConsoleEmailTakenError,
  createConsoleInvitation,
  listPendingConsoleInvitations,
  revokeConsoleInvitation,
} from "../../../../data/console-invitations.ts";
import { getHouseholdTimeZone } from "../../../../data/household-settings.ts";
import { getConsoleViewer } from "../../../../middleware/console.ts";
import type { AppContext } from "../../../../router.ts";
import { routes } from "../../../../routes.ts";
import { viewerFrom } from "../../../../ui/layout.tsx";
import { getNotice, withNotice, type Notice } from "../../../../utils/notice.ts";
import { render } from "../../../../utils/render.tsx";
import { adminSettingsMiddleware } from "../controller.tsx";
import { AccountsPage, type CreatedInvite } from "./accounts-page.tsx";

let inviteSchema = f.object({
  email: f.field(s.string().pipe(email(), maxLength(255))),
  name: f.field(s.string().pipe(minLength(1), maxLength(100))),
  role: f.field(s.string()),
});

function accountsIndexHref() {
  return routes.admin.settings.accounts.index.href();
}

function backToAccounts(request: Request, notice: Notice) {
  return redirect(withNotice(request, accountsIndexHref(), notice));
}

async function renderAccountsPage(
  context: Pick<AppContext, "get" | "request">,
  extra: { createdInvite?: CreatedInvite; notice?: Notice | null } = {},
) {
  let identity = getConsoleViewer(context);
  let [accounts, invitations, timeZone] = await Promise.all([
    listConsoleAccounts(),
    listPendingConsoleInvitations(),
    getHouseholdTimeZone(),
  ]);

  return render(
    <AccountsPage
      accounts={accounts}
      createdInvite={extra.createdInvite ?? null}
      invitations={invitations}
      notice={extra.notice === undefined ? getNotice(new URL(context.request.url)) : extra.notice}
      timeZone={timeZone}
      viewer={viewerFrom(identity)}
      viewerUserId={identity.user.id}
    />,
    context.request,
  );
}

export const adminSettingsAccounts = {
  middleware: adminSettingsMiddleware,
  actions: {
    async index(context) {
      return renderAccountsPage(context);
    },

    /** Renders the link in the response: only its hash is stored, so it can't be shown later. */
    async invite(context) {
      let { get, request } = context;
      let parsed = s.parseSafe(inviteSchema, get(FormData));
      let role = parsed.success ? parseConsoleRole(parsed.value.role) : null;
      if (!parsed.success || !role) {
        return backToAccounts(request, {
          text: parsed.success
            ? "Choose Admin or Parent."
            : (parsed.issues[0]?.message ?? "Enter a name and email."),
          type: "error",
        });
      }

      try {
        let { invitation, token } = await createConsoleInvitation({
          email: parsed.value.email,
          invitedByUserId: getConsoleViewer(context).user.id,
          name: parsed.value.name,
          role,
        });
        let url = new URL(
          routes.auth.invite.index.href({ token }),
          getEnv().betterAuthUrl,
        ).toString();

        return renderAccountsPage(context, {
          createdInvite: { email: invitation.email, url },
          notice: {
            text: `Invite for ${invitation.name} created as ${CONSOLE_ROLE_LABEL[role]}.`,
            type: "success",
          },
        });
      } catch (error) {
        if (error instanceof ConsoleEmailTakenError) {
          return backToAccounts(request, { text: error.message, type: "error" });
        }

        throw error;
      }
    },

    async revokeInvite({ params, request }) {
      let revoked = await revokeConsoleInvitation(params.inviteId);
      return backToAccounts(
        request,
        revoked
          ? { text: "Invite revoked. Its link no longer works.", type: "success" }
          : { text: "Invite not found.", type: "error" },
      );
    },

    async role(context) {
      let { get, params, request } = context;
      let role = parseConsoleRole(get(FormData).get("role"));
      if (!role) {
        return backToAccounts(request, { text: "Choose Admin or Parent.", type: "error" });
      }

      if (params.userId === getConsoleViewer(context).user.id) {
        return backToAccounts(request, {
          text: "You can't change your own role. Ask another admin.",
          type: "error",
        });
      }

      try {
        let account = await setConsoleRole(params.userId, role);
        return backToAccounts(
          request,
          account
            ? { text: `Role changed to ${CONSOLE_ROLE_LABEL[role]}.`, type: "success" }
            : { text: "Account not found.", type: "error" },
        );
      } catch (error) {
        if (error instanceof LastConsoleAdminError) {
          return backToAccounts(request, { text: error.message, type: "error" });
        }

        throw error;
      }
    },

    async remove(context) {
      let { params, request } = context;
      if (params.userId === getConsoleViewer(context).user.id) {
        return backToAccounts(request, {
          text: "You can't remove your own account. Ask another admin.",
          type: "error",
        });
      }

      try {
        let removed = await removeConsoleAccount(params.userId);
        return backToAccounts(
          request,
          removed
            ? { text: "Account removed.", type: "success" }
            : { text: "Account not found.", type: "error" },
        );
      } catch (error) {
        if (error instanceof LastConsoleAdminError) {
          return backToAccounts(request, { text: error.message, type: "error" });
        }

        throw error;
      }
    },
  },
} satisfies Controller<typeof routes.admin.settings.accounts, AppContext>;

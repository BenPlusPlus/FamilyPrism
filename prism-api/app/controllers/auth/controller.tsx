import type { Controller } from "remix/router";
import * as s from "remix/data-schema";
import * as f from "remix/data-schema/form-data";
import { email, maxLength, minLength } from "remix/data-schema/checks";
import { redirect } from "remix/response/redirect";
import type { Handle } from "remix/component";

import { getConsoleIdentityFromRequest, prismAuth } from "../../data/auth.ts";
import {
  bootstrapFirstAdmin,
  CONSOLE_ROLE_LABEL,
  consoleAccountExists,
  getConsoleRole,
  type ConsoleRole,
} from "../../data/console-accounts.ts";
import {
  claimConsoleInvitation,
  findConsoleInvitation,
  releaseOrphanedSignIn,
  type ConsoleInvitationRow,
} from "../../data/console-invitations.ts";
import type { AppContext } from "../../router.ts";
import { routes } from "../../routes.ts";
import { SoloShell } from "../../ui/layout.tsx";
import { ErrorList } from "../../ui/notice.tsx";
import {
  headersWithAuthCookies,
  signInWithEmail,
  signOutFromRequest,
  signUpWithEmail,
} from "../../utils/better-auth.ts";
import { render } from "../../utils/render.tsx";

let loginSchema = f.object({
  email: f.field(s.string().pipe(email())),
  password: f.field(s.string().pipe(minLength(8))),
});

let inviteSchema = f.object({
  name: f.field(s.string().pipe(minLength(1), maxLength(100))),
  password: f.field(s.string().pipe(minLength(8))),
});

let setupSchema = f.object({
  email: f.field(s.string().pipe(email())),
  name: f.field(s.string().pipe(minLength(1), maxLength(100))),
  password: f.field(s.string().pipe(minLength(8))),
});

function collectIssues(issues: ReadonlyArray<{ message: string }>) {
  return issues.map((issue) => issue.message);
}

function renderLoginPage(
  request: Request,
  input: {
    email?: string;
    errors?: string[];
  } = {},
  init?: ResponseInit,
) {
  return render(
    <LoginPage email={input.email ?? ""} errors={input.errors ?? []} />,
    request,
    init,
  );
}

function renderSetupPage(
  request: Request,
  input: {
    email?: string;
    errors?: string[];
    name?: string;
  } = {},
  init?: ResponseInit,
) {
  return render(
    <SetupPage
      email={input.email ?? ""}
      errors={input.errors ?? []}
      name={input.name ?? ""}
    />,
    request,
    init,
  );
}

function renderInvitePage(
  request: Request,
  token: string,
  invitation: ConsoleInvitationRow | null,
  input: { errors?: string[]; name?: string } = {},
  init?: ResponseInit,
) {
  return invitation
    ? render(
        <InvitePage
          email={invitation.email}
          errors={input.errors ?? []}
          name={input.name ?? invitation.name}
          role={invitation.role}
          token={token}
        />,
        request,
        init,
      )
    : render(<InviteGonePage />, request, { ...init, status: 410 });
}

export const auth = {
  actions: {
    async logout({ request }) {
      let result = await signOutFromRequest(request);

      return redirect(routes.home.href(), {
        headers: headersWithAuthCookies(result.response),
      });
    },
  },
} satisfies Controller<typeof routes.auth, AppContext>;

export const authLogin = {
  actions: {
    async index({ request }) {
      let identity = await getConsoleIdentityFromRequest(request);
      if (identity?.role) {
        return redirect(routes.admin.index.href());
      }

      return renderLoginPage(request);
    },

    async action({ get, request }) {
      let parsed = s.parseSafe(loginSchema, get(FormData));
      if (!parsed.success) {
        return renderLoginPage(
          request,
          {
            errors: collectIssues(parsed.issues),
          },
          { status: 400 },
        );
      }

      let result = await signInWithEmail(request, parsed.value);
      if (!result.response.ok || !result.data) {
        return renderLoginPage(
          request,
          {
            email: parsed.value.email,
            errors: [result.errorMessage ?? "Unable to sign in."],
          },
          { status: 401 },
        );
      }

      if (!(await getConsoleRole(result.data.user.id))) {
        return renderLoginPage(
          request,
          {
            email: parsed.value.email,
            errors: ["This account doesn't have access to the console."],
          },
          {
            headers: headersWithAuthCookies(result.response),
            status: 403,
          },
        );
      }

      return redirect(routes.admin.index.href(), {
        headers: headersWithAuthCookies(result.response),
      });
    },
  },
} satisfies Controller<typeof routes.auth.login, AppContext>;

export const authSetup = {
  actions: {
    async index({ request }) {
      let identity = await getConsoleIdentityFromRequest(request);
      if (identity?.role) {
        return redirect(routes.admin.index.href());
      }

      if (await consoleAccountExists()) {
        return redirect(routes.auth.login.index.href());
      }

      return renderSetupPage(request);
    },

    async action({ get, request }) {
      if (await consoleAccountExists()) {
        return redirect(routes.auth.login.index.href());
      }

      let parsed = s.parseSafe(setupSchema, get(FormData));
      if (!parsed.success) {
        return renderSetupPage(
          request,
          {
            errors: collectIssues(parsed.issues),
          },
          { status: 400 },
        );
      }

      let result = await signUpWithEmail(request, parsed.value);
      if (!result.response.ok || !result.data) {
        return renderSetupPage(
          request,
          {
            email: parsed.value.email,
            errors: [
              result.errorMessage ??
                "Unable to create the first admin account.",
            ],
            name: parsed.value.name,
          },
          { status: 400 },
        );
      }

      let bootstrapped = await bootstrapFirstAdmin(result.data.user.id);
      if (!bootstrapped) {
        return renderSetupPage(
          request,
          {
            email: parsed.value.email,
            errors: [
              "An admin user has already been created. Please sign in instead.",
            ],
            name: parsed.value.name,
          },
          {
            headers: headersWithAuthCookies(result.response),
            status: 409,
          },
        );
      }

      return redirect(routes.admin.index.href(), {
        headers: headersWithAuthCookies(result.response),
      });
    },
  },
} satisfies Controller<typeof routes.auth.setup, AppContext>;

export const authInvite = {
  actions: {
    async index({ params, request }) {
      return renderInvitePage(request, params.token, await findConsoleInvitation(params.token));
    },

    async action({ get, params, request }) {
      let invitation = await findConsoleInvitation(params.token);
      if (!invitation) {
        return renderInvitePage(request, params.token, null);
      }

      let parsed = s.parseSafe(inviteSchema, get(FormData));
      if (!parsed.success) {
        return renderInvitePage(
          request,
          params.token,
          invitation,
          {
            errors: collectIssues(parsed.issues),
            name: String(get(FormData).get("name") ?? ""),
          },
          { status: 400 },
        );
      }

      if (!(await releaseOrphanedSignIn(invitation.email))) {
        return renderInvitePage(
          request,
          params.token,
          invitation,
          {
            errors: ["That email already has a console account. Sign in instead."],
            name: parsed.value.name,
          },
          { status: 409 },
        );
      }

      let result = await signUpWithEmail(request, {
        email: invitation.email,
        name: parsed.value.name,
        password: parsed.value.password,
      });
      if (!result.response.ok || !result.data) {
        return renderInvitePage(
          request,
          params.token,
          invitation,
          {
            errors: [result.errorMessage ?? "Unable to create your account."],
            name: parsed.value.name,
          },
          { status: 400 },
        );
      }

      // Revoked or used by someone else between the check above and now.
      if (!(await claimConsoleInvitation(invitation.id, result.data.user.id))) {
        let context = await prismAuth.$context;
        await context.internalAdapter.deleteUser(result.data.user.id);
        return renderInvitePage(request, params.token, null);
      }

      return redirect(routes.admin.index.href(), {
        headers: headersWithAuthCookies(result.response),
      });
    },
  },
} satisfies Controller<typeof routes.auth.invite, AppContext>;

function InvitePage(
  handle: Handle<{
    email: string;
    errors: string[];
    name: string;
    role: ConsoleRole;
    token: string;
  }>,
) {
  return () => (
    <SoloShell
      title="Join"
      heading="Your key is on the rack."
      lede="Set a password to join this household's FamilyPrism console."
    >
      <h2>Create your account</h2>
      <p class="muted">
        You're joining as {handle.props.role === "admin" ? "an" : "a"}{" "}
        <strong>{CONSOLE_ROLE_LABEL[handle.props.role]}</strong>.
      </p>
      <ErrorList title="Couldn't create your account" errors={handle.props.errors} />
      <form method="post" action={routes.auth.invite.action.href({ token: handle.props.token })}>
        <label class="field">
          <span>Email</span>
          <input type="email" autocomplete="username" value={handle.props.email} readonly />
        </label>
        <label class="field">
          <span>Your name</span>
          <input
            type="text"
            name="name"
            autocomplete="name"
            maxlength={100}
            value={handle.props.name}
            required
          />
        </label>
        <label class="field">
          <span>Password</span>
          <input
            type="password"
            name="password"
            autocomplete="new-password"
            minlength={8}
            required
            aria-describedby="invite-password-hint"
          />
          <span class="hint" id="invite-password-hint">At least 8 characters.</span>
        </label>
        <div class="form-foot">
          <button class="btn" type="submit">
            Join
          </button>
        </div>
      </form>
    </SoloShell>
  );
}

function InviteGonePage() {
  return () => (
    <SoloShell
      title="Invite unavailable"
      heading="This key doesn't fit anymore."
      lede="Invite links work once and expire after a week."
    >
      <h2>Invite unavailable</h2>
      <p class="muted">
        This link was already used, revoked, or has expired. Ask an admin for a new one.
      </p>
      <p class="alt">
        Already have an account? <a href={routes.auth.login.index.href()}>Sign in</a>
      </p>
    </SoloShell>
  );
}

function LoginPage(handle: Handle<{ email: string; errors: string[] }>) {
  return () => (
    <SoloShell
      title="Sign in"
      heading="Every family PC, on one rack."
      lede="See who's home, message a screen, and keep DNS settings in line from your phone or desk."
    >
      <h2>Sign in</h2>
      <ErrorList title="Couldn't sign you in" errors={handle.props.errors} />
      <form method="post" action={routes.auth.login.action.href()}>
        <label class="field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autocomplete="username"
            value={handle.props.email}
            required
          />
        </label>
        <label class="field">
          <span>Password</span>
          <input type="password" name="password" autocomplete="current-password" required />
        </label>
        <div class="form-foot">
          <button class="btn" type="submit">
            Sign in
          </button>
        </div>
      </form>
      <p class="alt">
        First time here? <a href={routes.auth.setup.index.href()}>Set up the admin account</a>
      </p>
    </SoloShell>
  );
}

function SetupPage(
  handle: Handle<{ email: string; errors: string[]; name: string }>,
) {
  return () => (
    <SoloShell
      title="Set up"
      heading="Hang up the first key."
      lede="Create the admin account. You can register family PCs right after."
    >
      <h2>Create the admin account</h2>
      <ErrorList title="Couldn't create the account" errors={handle.props.errors} />
      <form method="post" action={routes.auth.setup.action.href()}>
        <label class="field">
          <span>Your name</span>
          <input
            type="text"
            name="name"
            autocomplete="name"
            maxlength={100}
            value={handle.props.name}
            required
          />
        </label>
        <label class="field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autocomplete="username"
            value={handle.props.email}
            required
          />
        </label>
        <label class="field">
          <span>Password</span>
          <input
            type="password"
            name="password"
            autocomplete="new-password"
            minlength={8}
            required
            aria-describedby="password-hint"
          />
          <span class="hint" id="password-hint">At least 8 characters.</span>
        </label>
        <div class="form-foot">
          <button class="btn" type="submit">
            Create account
          </button>
        </div>
      </form>
      <p class="alt">
        Already set up? <a href={routes.auth.login.index.href()}>Sign in</a>
      </p>
    </SoloShell>
  );
}

import type { Controller } from "remix/router";
import * as s from "remix/data-schema";
import * as f from "remix/data-schema/form-data";
import { email, maxLength, minLength } from "remix/data-schema/checks";
import { redirect } from "remix/response/redirect";
import type { Handle } from "remix/component";

import {
  adminExists,
  bootstrapFirstAdmin,
  isAdminUser,
} from "../../data/admin-users.ts";
import { getAdminIdentityFromRequest } from "../../data/auth.ts";
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
      let identity = await getAdminIdentityFromRequest(request);
      if (identity?.isAdmin) {
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

      if (!(await isAdminUser(result.data.user.id))) {
        return renderLoginPage(
          request,
          {
            email: parsed.value.email,
            errors: ["This account does not have admin access."],
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
      let identity = await getAdminIdentityFromRequest(request);
      if (identity?.isAdmin) {
        return redirect(routes.admin.index.href());
      }

      if (await adminExists()) {
        return redirect(routes.auth.login.index.href());
      }

      return renderSetupPage(request);
    },

    async action({ get, request }) {
      if (await adminExists()) {
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

import type { Controller } from "remix/fetch-router";
import * as s from "remix/data-schema";
import * as f from "remix/data-schema/form-data";
import { email, maxLength, minLength } from "remix/data-schema/checks";
import { redirect } from "remix/response/redirect";
import type { Handle } from "remix/ui";

import {
  adminExists,
  bootstrapFirstAdmin,
  isAdminUser,
} from "../../data/admin-users.ts";
import { getAdminIdentityFromRequest } from "../../data/auth.ts";
import type { AppContext } from "../../router.ts";
import { routes } from "../../routes.ts";
import { Layout } from "../../ui/layout.tsx";
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
  let setupHref = routes.auth.setup.index.href();
  let loginAction = routes.auth.login.action.href();

  return () => (
    <Layout title="Admin sign in">
      <h1>Admin sign in</h1>
      <p>Sign in with your Better Auth-backed admin account.</p>
      {handle.props.errors.length > 0 ? (
        <div class="notice error">
          <strong>Sign in failed.</strong>
          <ul>
            {handle.props.errors.map((error) => (
              <li>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <form method="post" action={loginAction} class="stack">
        <label>
          Email
          <input
            type="email"
            name="email"
            value={handle.props.email}
            required
          />
        </label>
        <label>
          Password
          <input type="password" name="password" required />
        </label>
        <button type="submit">Sign in</button>
      </form>
      <p>
        Need the first admin account? <a href={setupHref}>Run initial setup</a>.
      </p>
    </Layout>
  );
}

function SetupPage(
  handle: Handle<{ email: string; errors: string[]; name: string }>,
) {
  let setupAction = routes.auth.setup.action.href();
  let loginHref = routes.auth.login.index.href();

  return () => (
    <Layout title="Initial admin setup">
      <h1>Initial admin setup</h1>
      <p>The first successful signup becomes the initial admin account.</p>
      {handle.props.errors.length > 0 ? (
        <div class="notice error">
          <strong>Setup failed.</strong>
          <ul>
            {handle.props.errors.map((error) => (
              <li>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <form method="post" action={setupAction} class="stack">
        <label>
          Name
          <input type="text" name="name" value={handle.props.name} required />
        </label>
        <label>
          Email
          <input
            type="email"
            name="email"
            value={handle.props.email}
            required
          />
        </label>
        <label>
          Password
          <input type="password" name="password" required />
        </label>
        <button type="submit">Create admin account</button>
      </form>
      <p>
        Already have an admin account? <a href={loginHref}>Sign in</a>.
      </p>
    </Layout>
  );
}

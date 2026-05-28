import { createAction } from "remix/fetch-router";
import type { Handle } from "remix/ui";

import { adminExists } from "../data/admin-users.ts";
import { getAdminIdentityFromRequest } from "../data/auth.ts";
import type { AppContext } from "../router.ts";
import { routes } from "../routes.ts";
import { Layout } from "../ui/layout.tsx";
import { render } from "../utils/render.tsx";

export const home = createAction<typeof routes.home, AppContext>(routes.home, {
  async handler({ request }) {
    let [hasAdminUser, identity] = await Promise.all([
      adminExists(),
      getAdminIdentityFromRequest(request),
    ]);

    return render(
      <HomePage
        hasAdminUser={hasAdminUser}
        isAdmin={identity?.isAdmin ?? false}
      />,
      request,
    );
  },
});

function HomePage(handle: Handle<{ hasAdminUser: boolean; isAdmin: boolean }>) {
  return () => {
    let authHref = handle.props.hasAdminUser
      ? routes.auth.login.index.href()
      : routes.auth.setup.index.href();
    let authLabel = handle.props.hasAdminUser
      ? "Admin sign in"
      : "Create first admin";

    return (
      <Layout title="Prism API">
        <h1>Prism API</h1>
        <p>
          Prism keeps WebSocket connections open to registered clients so
          authenticated admins can send commands through the web interface.
        </p>
        <div class="card-grid">
          <article class="card">
            <h2>Admin access</h2>
            <p>
              Admin users authenticate with Better Auth and PostgreSQL-backed
              sessions before they can manage clients or send messages.
            </p>
            <a
              href={handle.props.isAdmin ? routes.admin.index.href() : authHref}
            >
              {handle.props.isAdmin ? "Open admin dashboard" : authLabel}
            </a>
          </article>
          <article class="card">
            <h2>Client onboarding</h2>
            <p>
              Clients register once with a registration password and receive a
              permanent credential that they use for API traffic and WebSocket
              connections.
            </p>
            <code>POST /api/clients/register</code>
          </article>
        </div>
        <section class="card">
          <h2>WebSocket connection requirements</h2>
          <p>
            Connect to <code>{routes.websocket.href()}</code> with the client id
            in the
            <code> x-client-id</code> header and the permanent credential in the
            <code> Authorization: Bearer ...</code> header.
          </p>
        </section>
      </Layout>
    );
  };
}

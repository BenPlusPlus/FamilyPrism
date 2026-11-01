import { createAction } from "remix/router";
import type { Handle } from "remix/component";

import { adminExists } from "../data/admin-users.ts";
import { getAdminIdentityFromRequest } from "../data/auth.ts";
import type { AppContext } from "../router.ts";
import { routes } from "../routes.ts";
import { BrandMark } from "../ui/icons.tsx";
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
    let { hasAdminUser, isAdmin } = handle.props;
    let cta = isAdmin
      ? { href: routes.admin.index.href(), label: "Open the rack" }
      : hasAdminUser
        ? { href: routes.auth.login.index.href(), label: "Sign in" }
        : { href: routes.auth.setup.index.href(), label: "Set up the admin account" };

    return (
      <Layout title="Home">
        <div class="public">
          <header class="public-top">
            <span class="brand">
              <BrandMark />
              FamilyPrism
            </span>
            <a class="btn" href={cta.href}>
              {cta.label}
            </a>
          </header>

          <main id="main">
            <h1>The household's PCs, on one rack.</h1>
            <p class="lead">
              This server keeps a live connection to each registered family PC, so
              an admin can see who's home, send a message to a screen, take a
              screenshot, or switch DNS settings.
            </p>
          </main>

          <section class="panel" aria-labelledby="connect-title">
            <div class="panel-head">
              <h2 id="connect-title">Connecting a PC</h2>
            </div>
            <ol class="steps">
              <li>
                <span class="n">1</span>
                <div>
                  <h3>Register once</h3>
                  <p>
                    The Prism agent calls <code class="data">POST /api/clients/register</code>{" "}
                    with the registration password and gets back a permanent credential.
                  </p>
                </div>
              </li>
              <li>
                <span class="n">2</span>
                <div>
                  <h3>Stay connected</h3>
                  <p>
                    It opens a WebSocket to <code class="data">{routes.websocket.href()}</code>{" "}
                    with its id in <code class="data">x-client-id</code> and{" "}
                    <code class="data">Authorization: Bearer &lt;credential&gt;</code>.
                  </p>
                </div>
              </li>
              <li>
                <span class="n">3</span>
                <div>
                  <h3>Show up on the rack</h3>
                  <p>Once connected, the PC appears as home in the admin console.</p>
                </div>
              </li>
            </ol>
          </section>
        </div>
      </Layout>
    );
  };
}

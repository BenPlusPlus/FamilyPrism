import type { Handle } from "remix/ui";

import { routes } from "../../routes.ts";
import { Layout } from "../../ui/layout.tsx";
import { getNotice } from "../../utils/notice.ts";
import { renderNotice } from "./notice.tsx";

export function DashboardPage(
  handle: Handle<{
    adminName: string;
    clientCount: number;
    connectedClientCount: number;
    groupCount: number;
    notice: ReturnType<typeof getNotice>;
  }>,
) {
  return () => (
    <Layout title="Admin dashboard">
      <h1>Admin dashboard</h1>
      <p>Signed in as {handle.props.adminName}.</p>
      {handle.props.notice ? renderNotice(handle.props.notice) : null}
      <div class="card-grid">
        <article class="card">
          <h2>Clients</h2>
          <p>{handle.props.clientCount} total clients</p>
          <p>{handle.props.connectedClientCount} currently connected</p>
          <a href={routes.admin.clients.index.href()}>Manage clients</a>
        </article>
        <article class="card">
          <h2>Groups</h2>
          <p>{handle.props.groupCount} configured groups</p>
          <a href={routes.admin.groups.index.href()}>Manage groups</a>
        </article>
        <article class="card">
          <h2>Settings</h2>
          <p>Configure reusable admin controls, including DNS profiles.</p>
          <a href={routes.admin.settings.index.href()}>Manage settings</a>
        </article>
      </div>
    </Layout>
  );
}

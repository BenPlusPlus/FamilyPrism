import type { Handle } from "remix/component";

import type { HistoryList, VisitBrowser } from "../../data/visits.ts";
import { VISIT_BROWSERS } from "../../data/visits.ts";
import { routes } from "../../routes.ts";
import { Icon } from "../../ui/icons.tsx";
import { AdminShell } from "../../ui/layout.tsx";
import { NoticeBar } from "../../ui/notice.tsx";
import { VisitLog } from "../../ui/visit-log.tsx";
import type { Notice } from "../../utils/notice.ts";

function historyHref(
  query: { browser: string; client: string; q: string; user: string },
  page: number,
) {
  let params = new URLSearchParams();
  if (query.client) {
    params.set("client", query.client);
  }
  if (query.user) {
    params.set("user", query.user);
  }
  if (query.browser) {
    params.set("browser", query.browser);
  }
  if (query.q) {
    params.set("q", query.q);
  }
  if (page > 1) {
    params.set("page", String(page));
  }

  let href = routes.admin.history.index.href();
  let search = params.toString();
  return search ? `${href}?${search}` : href;
}

export function HistoryPage(
  handle: Handle<{
    adminName: string;
    filterOptions: {
      browsers: VisitBrowser[];
      clients: { id: string; name: string }[];
      windowsUsers: string[];
    };
    history: HistoryList;
    notice: Notice | null;
    query: { browser: string; client: string; q: string; user: string };
  }>,
) {
  return () => {
    let { adminName, filterOptions, history, notice, query } = handle.props;
    let { page, pageCount, total, visits } = history;
    let filtered = Boolean(query.browser || query.client || query.q || query.user);
    let lede =
      total === 0
        ? filtered
          ? "No Visits match."
          : "No Visits yet."
        : `${total} ${total === 1 ? "Visit" : "Visits"}, newest first.`;
    let windowsUsers = [...filterOptions.windowsUsers];
    if (query.user && !windowsUsers.includes(query.user)) {
      windowsUsers.push(query.user);
      windowsUsers.sort((left, right) => left.localeCompare(right));
    }
    let browsers = VISIT_BROWSERS.filter(
      (browser) => filterOptions.browsers.includes(browser) || browser === query.browser,
    );

    return (
      <AdminShell active="history" title="History" adminName={adminName}>
        <header class="page-head">
          <div>
            <h1>History</h1>
            <p>{lede}</p>
          </div>
        </header>

        <NoticeBar notice={notice} />

        <section class="panel">
          <form class="filters" method="get" action={routes.admin.history.index.href()}>
            <div class="filters-grid">
              <label class="field">
                <span>Client</span>
                <select name="client">
                  <option value="" selected={query.client === ""}>
                    All Clients
                  </option>
                  {filterOptions.clients.map((client) => (
                    <option value={client.id} selected={query.client === client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
              <label class="field">
                <span>Windows user</span>
                <select name="user">
                  <option value="" selected={query.user === ""}>
                    All Windows users
                  </option>
                  {windowsUsers.map((windowsUser) => (
                    <option value={windowsUser} selected={query.user === windowsUser}>
                      {windowsUser}
                    </option>
                  ))}
                </select>
              </label>
              <label class="field">
                <span>Browser</span>
                <select name="browser">
                  <option value="" selected={query.browser === ""}>
                    All browsers
                  </option>
                  {browsers.map((browser) => (
                    <option value={browser} selected={query.browser === browser}>
                      {browser}
                    </option>
                  ))}
                </select>
              </label>
              <label class="field filters-search">
                <span>Search</span>
                <span class="search-input">
                  <Icon name="search" />
                  <input
                    type="search"
                    name="q"
                    value={query.q}
                    placeholder="URL or title"
                  />
                </span>
              </label>
              <div class="filters-actions">
                <button class="btn" type="submit">
                  Show matches
                </button>
                {filtered ? (
                  <a class="btn secondary" href={routes.admin.history.index.href()}>
                    <Icon name="close" />
                    Clear
                  </a>
                ) : null}
              </div>
            </div>
          </form>

          {visits.length === 0 ? (
            <div class="empty">
              <strong>{filtered ? "No Visits match." : "No Visits yet."}</strong>
              <p>
                {filtered
                  ? "Try another Client, Windows user, browser or search."
                  : "Visits show up here once a Client with History collection on uploads them."}
              </p>
            </div>
          ) : (
            <>
              <VisitLog
                visits={visits}
                showClient={!query.client}
                deleteHref={(visit) => routes.admin.history.delete.href({ visitId: visit.id })}
                returnTo={historyHref(query, page)}
              />
              {total > visits.length || page > 1 ? (
                <nav class="pager" aria-label="History pages">
                  {page > 1 ? (
                    <a class="btn secondary" href={historyHref(query, page - 1)}>
                      <Icon name="back" />
                      Previous
                    </a>
                  ) : (
                    <span class="btn secondary" aria-disabled="true">
                      <Icon name="back" />
                      Previous
                    </span>
                  )}
                  <span class="pager-status">
                    Page {page} of {pageCount}
                  </span>
                  {page < pageCount ? (
                    <a class="btn secondary" href={historyHref(query, page + 1)}>
                      Next
                      <Icon name="chevron" />
                    </a>
                  ) : (
                    <span class="btn secondary" aria-disabled="true">
                      Next
                      <Icon name="chevron" />
                    </span>
                  )}
                </nav>
              ) : null}
            </>
          )}
        </section>
      </AdminShell>
    );
  };
}

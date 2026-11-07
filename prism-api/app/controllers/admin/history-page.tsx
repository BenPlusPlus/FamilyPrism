import type { Handle } from "remix/component";

import type { HistoryList, VisitBrowser } from "../../data/visits.ts";
import { VISIT_BROWSERS } from "../../data/visits.ts";
import { routes } from "../../routes.ts";
import { AdminShell } from "../../ui/layout.tsx";
import { NoticeBar } from "../../ui/notice.tsx";
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

function formatVisitTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
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
            <div class="form-row">
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
            </div>
            <label class="field">
              <span>Search</span>
              <input
                type="search"
                name="q"
                value={query.q}
                placeholder="URL or title"
              />
            </label>
            <div class="form-foot">
              <button class="btn" type="submit">
                Show matches
              </button>
            </div>
          </form>

          {visits.length === 0 ? (
            <p class="empty">
              <strong>{filtered ? "No Visits match." : "No Visits yet."}</strong>
            </p>
          ) : (
            <>
              <div class="table-wrap">
                <table class="grid stackable">
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">Client</th>
                      <th scope="col">Windows user</th>
                      <th scope="col">Browser</th>
                      <th scope="col">Title</th>
                      <th scope="col">URL</th>
                      <th scope="col">
                        <span class="visually-hidden">Delete</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map((visit) => (
                      <tr>
                        <td data-label="Time">{formatVisitTime(visit.visitedAt)}</td>
                        <td data-label="Client">{visit.clientName}</td>
                        <td data-label="Windows user">{visit.windowsUser}</td>
                        <td data-label="Browser">
                          {visit.browser} · {visit.browserProfile}
                        </td>
                        <td data-label="Title">{visit.title || <span class="muted">Untitled</span>}</td>
                        <td data-label="URL">
                          <span class="visit-url">{visit.url}</span>
                        </td>
                        <td data-label="Delete">
                          <form
                            method="post"
                            action={routes.admin.history.delete.href({ visitId: visit.id })}
                          >
                            <input type="hidden" name="returnTo" value={historyHref(query, page)} />
                            <button class="btn-link danger" type="submit">
                              Delete
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {total > visits.length || page > 1 ? (
                <nav class="pager" aria-label="History pages">
                  {page > 1 ? (
                    <a class="btn secondary" href={historyHref(query, page - 1)}>
                      Previous
                    </a>
                  ) : (
                    <span class="btn secondary" aria-disabled="true">
                      Previous
                    </span>
                  )}
                  <span class="pager-status">
                    Page {page} of {pageCount}
                  </span>
                  {page < pageCount ? (
                    <a class="btn secondary" href={historyHref(query, page + 1)}>
                      Next
                    </a>
                  ) : (
                    <span class="btn secondary" aria-disabled="true">
                      Next
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

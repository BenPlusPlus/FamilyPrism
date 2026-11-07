import type { Handle } from "remix/component";

import type { HistoryList } from "../../data/visits.ts";
import { routes } from "../../routes.ts";
import { AdminShell } from "../../ui/layout.tsx";
import { NoticeBar } from "../../ui/notice.tsx";
import type { Notice } from "../../utils/notice.ts";

function historyHref(page: number) {
  let href = routes.admin.history.index.href();
  return page <= 1 ? href : `${href}?page=${page}`;
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
    history: HistoryList;
    notice: Notice | null;
  }>,
) {
  return () => {
    let { adminName, history, notice } = handle.props;
    let { page, pageCount, total, visits } = history;
    let lede =
      total === 0
        ? "No Visits yet."
        : `${total} ${total === 1 ? "Visit" : "Visits"}, newest first.`;

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
          {visits.length === 0 ? (
            <p class="empty">
              <strong>No Visits yet.</strong>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {total > visits.length || page > 1 ? (
                <nav class="pager" aria-label="History pages">
                  {page > 1 ? (
                    <a class="btn secondary" href={historyHref(page - 1)}>
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
                    <a class="btn secondary" href={historyHref(page + 1)}>
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

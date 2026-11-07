import type { Handle } from "remix/component";

import type { HistoryVisit } from "../data/visits.ts";
import { routes } from "../routes.ts";
import { Icon } from "./icons.tsx";
import { TagChip } from "./key-tag.tsx";

interface VisitDay {
  key: string;
  date: Date;
  visits: HistoryVisit[];
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

// Visits arrive newest first, so consecutive runs share a day.
function groupByDay(visits: HistoryVisit[]) {
  let days: VisitDay[] = [];
  for (let visit of visits) {
    let date = new Date(visit.visitedAt);
    let key = dayKey(date);
    let current = days.at(-1);
    if (current && current.key === key) {
      current.visits.push(visit);
    } else {
      days.push({ key, date, visits: [visit] });
    }
  }
  return days;
}

function dayName(date: Date, now: Date) {
  let yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  let key = dayKey(date);
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(yesterday)) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

function dayDate(date: Date, now: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

function visitTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

interface VisitEntry {
  visit: HistoryVisit;
  /** How many back-to-back Visits this row stands for. */
  count: number;
}

function browserLabel(visit: HistoryVisit) {
  return `${visit.browser} · ${visit.browserProfile}`;
}

// Back-to-back Visits to the exact same page by the same person and browser
// read as one row with a count. Visits arrive newest first, so the row keeps
// the newest time.
function collapseRepeats(visits: HistoryVisit[]) {
  let entries: VisitEntry[] = [];
  for (let visit of visits) {
    let previous = entries.at(-1)?.visit;
    if (
      previous &&
      previous.url === visit.url &&
      previous.title === visit.title &&
      previous.windowsUser === visit.windowsUser &&
      browserLabel(previous) === browserLabel(visit)
    ) {
      entries[entries.length - 1].count += 1;
    } else {
      entries.push({ visit, count: 1 });
    }
  }
  return entries;
}

// A fact every listed Visit shares is said once above the list, not per row.
function sharedValue(visits: HistoryVisit[], read: (visit: HistoryVisit) => string) {
  if (visits.length < 2) return null;
  let first = read(visits[0]);
  return visits.every((visit) => read(visit) === first) ? first : null;
}

function UserFact(handle: Handle<{ value: string }>) {
  return () => (
    <span class="visit-fact">
      <Icon name="user" />
      <span class="visually-hidden">Windows user </span>
      {handle.props.value}
    </span>
  );
}

function BrowserFact(handle: Handle<{ value: string }>) {
  return () => (
    <span class="visit-fact">
      <Icon name="browser" />
      <span class="visually-hidden">Browser </span>
      {handle.props.value}
    </span>
  );
}

export function VisitLog(
  handle: Handle<{
    visits: HistoryVisit[];
    /** Show which Client each Visit came from (off on a Client's own page). */
    showClient?: boolean;
    /** Heading level for the day dividers, so they sit under the page's outline. */
    dayHeading?: "h2" | "h3";
    /** Fold back-to-back Visits to the same page into one counted row. */
    foldRepeats?: boolean;
    /** When set, each Visit gets a Delete control that posts here. */
    deleteHref?: (visit: HistoryVisit) => string;
    returnTo?: string;
  }>,
) {
  return () => {
    let {
      visits,
      showClient = false,
      dayHeading = "h2",
      foldRepeats = false,
      deleteHref,
      returnTo,
    } = handle.props;
    let now = new Date();
    let Heading = dayHeading;
    let sharedUser = sharedValue(visits, (visit) => visit.windowsUser);
    let sharedBrowser = sharedValue(visits, browserLabel);
    let factsShared = sharedUser !== null && sharedBrowser !== null;
    let rowClass = factsShared ? (showClient ? "visit chip-only" : "visit bare") : "visit";
    let bare = factsShared && !showClient;

    return (
      <div class={`visit-log${deleteHref ? " can-delete" : ""}`}>
        {sharedUser !== null || sharedBrowser !== null ? (
          <p class="visit-common">
            <span>{visits.length === 2 ? "Both Visits" : `All ${visits.length} Visits`}:</span>
            {sharedUser !== null ? <UserFact value={sharedUser} /> : null}
            {sharedBrowser !== null ? <BrowserFact value={sharedBrowser} /> : null}
          </p>
        ) : null}
        {groupByDay(visits).map((day) => (
          <section class="visit-day" aria-labelledby={`visit-day-${day.key}`}>
            <Heading class="visit-day-head" id={`visit-day-${day.key}`}>
              <span>{dayName(day.date, now)}</span>
              <time class="visit-day-date" datetime={day.key}>
                {dayDate(day.date, now)}
              </time>
            </Heading>
            <ol class="visits">
              {(foldRepeats
                ? collapseRepeats(day.visits)
                : day.visits.map((visit) => ({ visit, count: 1 }))
              ).map(({ visit, count }) => (
                <li class={rowClass}>
                  <time class="visit-time" datetime={visit.visitedAt}>
                    {visitTime(visit.visitedAt)}
                  </time>
                  <div class="visit-main">
                    <p class="visit-title">
                      <span class="visit-title-text" title={visit.title || undefined}>
                        {visit.title || <span class="muted">Untitled</span>}
                      </span>
                      {count > 1 ? <span class="visit-count">{count} visits</span> : null}
                    </p>
                    <span title={visit.url} class="visit-url">{visit.url}</span>
                  </div>
                  {bare ? null : (
                    <div class="visit-meta">
                      {showClient ? (
                        <TagChip
                          client={{ id: visit.clientId, name: visit.clientName }}
                          href={routes.admin.clients.detail.href({ clientId: visit.clientId })}
                        />
                      ) : null}
                      {sharedUser === null ? <UserFact value={visit.windowsUser} /> : null}
                      {sharedBrowser === null ? <BrowserFact value={browserLabel(visit)} /> : null}
                    </div>
                  )}
                  {deleteHref ? (
                    <form class="visit-delete" method="post" action={deleteHref(visit)}>
                      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
                      <button
                        class="icon-btn danger"
                        type="submit"
                        aria-label={`Delete Visit: ${visit.title || visit.url}`}
                        title="Delete Visit"
                      >
                        <Icon name="trash" />
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    );
  };
}

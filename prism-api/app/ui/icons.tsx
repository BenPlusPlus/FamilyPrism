import type { Handle } from "remix/component";

export type IconName =
  | "rack"
  | "monitor"
  | "groups"
  | "dns"
  | "history"
  | "chevron"
  | "back"
  | "check"
  | "alert"
  | "camera"
  | "send"
  | "refresh"
  | "plus"
  | "user"
  | "browser"
  | "trash"
  | "search"
  | "close";

const PATHS: Record<IconName, string[]> = {
  rack: ["M3 6h18", "M7 6v3", "M12 6v3", "M17 6v3", "M5.5 11h3v8h-3z", "M10.5 11h3v8h-3z", "M15.5 11h3v8h-3z"],
  monitor: ["M3.5 5h17v11h-17z", "M9 20h6", "M12 16v4"],
  groups: ["M4 8l8-4 8 4-8 4z", "M4 12l8 4 8-4", "M4 16l8 4 8-4"],
  dns: ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z", "M3 12h18", "M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9s1.2-6.4 3.7-9z"],
  history: ["M12 8v5l3.5 2", "M12 21a9 9 0 1 0 0-18a9 9 0 1 0 0 18z"],
  chevron: ["M9 6l6 6-6 6"],
  back: ["M15 6l-6 6 6 6"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  alert: ["M12 3.5l9.5 16.5h-19z", "M12 10v4.5", "M12 17.2v.3"],
  camera: ["M4 8h3.5l1.5-2.5h6L16.5 8H20v11H4z", "M12 10.5a3.3 3.3 0 1 0 0 6.6a3.3 3.3 0 1 0 0-6.6z"],
  send: ["M4 12l16-7-6.5 15-2.5-6z", "M11 14l9-9"],
  refresh: ["M19.5 8.5A8 8 0 0 0 5 7.5", "M4.5 15.5A8 8 0 0 0 19 16.5", "M19.5 3.5v5h-5", "M4.5 20.5v-5h5"],
  plus: ["M12 5v14", "M5 12h14"],
  user: ["M12 4.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z", "M5 20c.4-3.6 3.3-6 7-6s6.6 2.4 7 6"],
  browser: ["M3.5 5h17v14h-17z", "M3.5 9h17", "M6.5 7h.01", "M9 7h.01"],
  trash: ["M4.5 7h15", "M9.5 7V4.5h5V7", "M6.5 7l1 12.5h9l1-12.5", "M10.5 11v5", "M13.5 11v5"],
  search: ["M10.5 4.5a6 6 0 1 0 0 12a6 6 0 1 0 0-12z", "M15 15l4.5 4.5"],
  close: ["M6.5 6.5l11 11", "M17.5 6.5l-11 11"],
};

export function Icon(handle: Handle<{ name: IconName }>) {
  return () => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[handle.props.name].map((d) => (
        <path d={d} />
      ))}
    </svg>
  );
}

export function BrandMark() {
  return () => (
    <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="5" r="3" fill="none" stroke="#9aa3a6" stroke-width="2" />
      <rect x="4" y="8.5" width="16" height="13" rx="3" fill="#f2b705" stroke="#9aa3a6" stroke-width="2" />
      <rect x="7" y="12.5" width="10" height="3.5" rx="0.5" fill="#121415" />
    </svg>
  );
}

import type { Handle, RemixNode } from "remix/component";

import { routes } from "../routes.ts";
import { Document } from "./document.tsx";
import { BrandMark, Icon, type IconName } from "./icons.tsx";

export type AdminSection = "home" | "clients" | "groups" | "dns";

const SECTIONS: Array<{ id: AdminSection; label: string; icon: IconName; href: () => string }> = [
  { id: "home", label: "Home", icon: "rack", href: () => routes.admin.index.href() },
  { id: "clients", label: "Clients", icon: "monitor", href: () => routes.admin.clients.index.href() },
  { id: "groups", label: "Groups", icon: "groups", href: () => routes.admin.groups.index.href() },
  {
    id: "dns",
    label: "DNS profiles",
    icon: "dns",
    href: () => routes.admin.settings.dnsProfiles.index.href(),
  },
];

export interface LayoutProps {
  children?: RemixNode;
  title?: string;
}

/** Public pages: home, sign in, setup. */
export function Layout(handle: Handle<LayoutProps>) {
  return () => (
    <Document title={handle.props.title}>{handle.props.children}</Document>
  );
}

const SAMPLE_TAGS = [
  { id: "sample-a", name: "Kitchen", cls: "c1 home" },
  { id: "sample-b", name: "Den", cls: "c2 home" },
  { id: "sample-c", name: "Study", cls: "c0 away" },
];

export interface SoloShellProps {
  children?: RemixNode;
  heading: string;
  lede: string;
  title: string;
}

/** Sign in and first-run setup: slate key-rack panel beside the form. */
export function SoloShell(handle: Handle<SoloShellProps>) {
  return () => (
    <Document title={handle.props.title}>
      <div class="solo">
        <aside class="solo-side">
          <a class="brand" href={routes.home.href()}>
            <BrandMark />
            FamilyPrism
          </a>
          <div class="solo-rack" aria-hidden="true">
            {SAMPLE_TAGS.map((tag) => (
              <div class={`tag ${tag.cls}`}>
                <span class="tag-ring"></span>
                <span class="tag-plate">
                  <span class="tape">{tag.name}</span>
                </span>
              </div>
            ))}
          </div>
          <div class="solo-copy">
            <h1>{handle.props.heading}</h1>
            <p>{handle.props.lede}</p>
          </div>
        </aside>
        <main class="solo-main" id="main">
          <div class="solo-card">{handle.props.children}</div>
        </main>
      </div>
    </Document>
  );
}

export interface AdminShellProps {
  active: AdminSection;
  adminName?: string;
  children?: RemixNode;
  title: string;
}

export function AdminShell(handle: Handle<AdminShellProps>) {
  return () => (
    <Document title={handle.props.title}>
      <div class="shell">
        <aside class="rail">
          <a class="brand" href={routes.admin.index.href()}>
            <BrandMark />
            FamilyPrism
          </a>
          <nav class="rail-nav" aria-label="Admin">
            {SECTIONS.map((section) => (
              <a
                class="rail-link"
                href={section.href()}
                aria-current={section.id === handle.props.active ? "page" : undefined}
              >
                <Icon name={section.icon} />
                {section.label}
              </a>
            ))}
          </nav>
          <div class="rail-foot">
            {handle.props.adminName ? (
              <span class="who">
                Signed in as <strong>{handle.props.adminName}</strong>
              </span>
            ) : null}
            <form method="post" action={routes.auth.logout.href()}>
              <button class="btn-link" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </aside>
        <main class="page" id="main">
          {handle.props.children}
        </main>
        <nav class="tabbar" aria-label="Admin sections">
          {SECTIONS.map((section) => (
            <a href={section.href()} aria-current={section.id === handle.props.active ? "page" : undefined}>
              <Icon name={section.icon} />
              {section.id === "dns" ? "DNS" : section.label}
            </a>
          ))}
        </nav>
      </div>
    </Document>
  );
}

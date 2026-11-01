export interface TagClient {
  id: string;
  name: string;
  last_user: string | null;
  lastSeenVersion: string | null;
  isStale: boolean;
}

const TAG_COLOURS = 6;

export function tagClass(clientId: string) {
  let hash = 0;
  for (let index = 0; index < clientId.length; index++) {
    hash = (hash * 31 + clientId.charCodeAt(index)) >>> 0;
  }
  return `c${hash % TAG_COLOURS}`;
}

// Windows reports DOMAIN\user; the tag only has room for the account name.
function shortUser(user: string | null) {
  if (!user) return "";
  return user.slice(user.lastIndexOf("\\") + 1);
}

export function KeyTag() {
  return ({
    client,
    connected,
    href,
  }: {
    client: TagClient;
    connected: boolean;
    href?: string;
  }) => {
    let className = `tag ${connected ? "home" : "away"} ${tagClass(client.id)}`;
    let label = `${client.name}, ${connected ? "connected" : "offline"}${
      client.last_user ? `, last used by ${client.last_user}` : ""
    }`;
    let body = (
      <>
        <span class="tag-ring" aria-hidden="true"></span>
        <span class="tag-plate">
          <span class="tape">{client.name}</span>
          <span class="tag-meta">
            <span class="tag-status">{connected ? "Home" : "Offline"}</span>
            <span class="tag-user" title={client.last_user ?? undefined}>
              {shortUser(client.last_user)}
            </span>
            <span class="tag-version">
              {client.lastSeenVersion ? `v${client.lastSeenVersion}` : "No version"}
            </span>
            {client.isStale ? <span class="tape warn">Update due</span> : <span></span>}
          </span>
        </span>
      </>
    );

    return href ? (
      <a class={className} href={href} aria-label={label}>
        {body}
      </a>
    ) : (
      <div class={className}>
        {body}
      </div>
    );
  };
}

export function TagChip() {
  return ({ client, href }: { client: Pick<TagClient, "id" | "name">; href?: string }) => {
    let inner = (
      <>
        <span class="chip-dot" aria-hidden="true"></span>
        <span class="tape">{client.name}</span>
      </>
    );

    return href ? (
      <a class={`chip ${tagClass(client.id)}`} href={href}>
        {inner}
      </a>
    ) : (
      <span class={`chip ${tagClass(client.id)}`}>{inner}</span>
    );
  };
}

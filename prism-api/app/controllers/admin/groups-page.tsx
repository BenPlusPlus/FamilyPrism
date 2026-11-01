import type { Handle } from "remix/component";

import type { listClients } from "../../data/clients.ts";
import type { listGroupsWithMembers } from "../../data/groups.ts";
import { routes } from "../../routes.ts";
import { Icon } from "../../ui/icons.tsx";
import { TagChip, tagClass } from "../../ui/key-tag.tsx";
import { AdminShell } from "../../ui/layout.tsx";
import { NoticeBar } from "../../ui/notice.tsx";
import type { Notice } from "../../utils/notice.ts";

type PickClient = Pick<Awaited<ReturnType<typeof listClients>>[number], "id" | "name">;

function ClientPicker(handle: Handle<{ clients: PickClient[]; selected: Set<string> }>) {
  return () =>
    handle.props.clients.length === 0 ? (
      <p class="hint">No PCs registered yet. You can add members later.</p>
    ) : (
      <div class="pick-grid">
        {handle.props.clients.map((client) => (
          <label class={`pick ${tagClass(client.id)}`}>
            <input
              type="checkbox"
              name="clientId"
              value={client.id}
              checked={handle.props.selected.has(client.id)}
            />
            <span class="swatch" aria-hidden="true"></span>
            <span class="pick-label">{client.name}</span>
          </label>
        ))}
      </div>
    );
}

export function GroupsPage(
  handle: Handle<{
    adminName: string;
    allClients: PickClient[];
    groups: Awaited<ReturnType<typeof listGroupsWithMembers>>;
    notice: Notice | null;
  }>,
) {
  return () => {
    let { adminName, allClients, groups, notice } = handle.props;
    let none = new Set<string>();

    return (
      <AdminShell active="groups" title="Groups" adminName={adminName}>
        <header class="page-head">
          <div>
            <h1>Groups</h1>
            <p>Bundle PCs together, like "Kids' rooms", to message them all at once.</p>
          </div>
        </header>

        <NoticeBar notice={notice} />

        <div class="split">
          <section class="panel" aria-labelledby="groups-title">
            <div class="panel-head">
              <h2 id="groups-title">Your groups</h2>
              <span class="count">{groups.length}</span>
            </div>
            {groups.length === 0 ? (
              <p class="empty">
                <strong>No groups yet.</strong>
                Create one to send a single message to several PCs.
              </p>
            ) : (
              groups.map((group) => {
                let memberIds = new Set(group.members.map((member) => member.id));
                let messageId = `group-message-${group.id}`;
                return (
                  <article class="group">
                    <div class="group-head">
                      <h3>{group.name}</h3>
                      <span class="hint">
                        {group.members.length} {group.members.length === 1 ? "PC" : "PCs"}
                      </span>
                    </div>
                    {group.description ? <p class="muted">{group.description}</p> : null}
                    {group.members.length > 0 ? (
                      <div class="chip-list">
                        {group.members.map((member) => (
                          <TagChip
                            client={member}
                            href={routes.admin.clients.detail.href({ clientId: member.id })}
                          />
                        ))}
                      </div>
                    ) : (
                      <p class="hint">No members yet. Add some PCs below.</p>
                    )}
                    <p class="hint">Only members that are home get it; messages aren't queued.</p>
                    <form
                      class="inline-compose"
                      method="post"
                      action={routes.admin.messages.group.href({ groupId: group.id })}
                    >
                      <label class="field">
                        <span class="visually-hidden" id={messageId}>
                          Message to {group.name}
                        </span>
                        <textarea
                          name="content"
                          rows={1}
                          maxlength={500}
                          required
                          aria-labelledby={messageId}
                          placeholder={`Message everyone in ${group.name}`}
                          disabled={group.members.length === 0}
                        ></textarea>
                      </label>
                      <button class="btn" type="submit" disabled={group.members.length === 0}>
                        <Icon name="send" />
                        Send
                      </button>
                    </form>
                    <details class="disclose">
                      <summary>
                        <Icon name="chevron" />
                        Change members
                      </summary>
                      <form
                        class="disclose-body"
                        method="post"
                        action={routes.admin.groups.members.href({ groupId: group.id })}
                      >
                        <fieldset>
                          <legend class="visually-hidden">Members of {group.name}</legend>
                          <ClientPicker clients={allClients} selected={memberIds} />
                        </fieldset>
                        <div class="form-foot">
                          <span class="hint">Unticked PCs leave the group.</span>
                          <button class="btn secondary" type="submit">
                            Save members
                          </button>
                        </div>
                      </form>
                    </details>
                  </article>
                );
              })
            )}
          </section>

          <section class="panel" aria-labelledby="create-group-title">
            <div class="panel-head">
              <h2 id="create-group-title">New group</h2>
            </div>
            <form class="panel-body" method="post" action={routes.admin.groups.create.href()}>
              <label class="field">
                <span>Name</span>
                <input type="text" name="name" required maxlength={100} placeholder="Kids' rooms" />
              </label>
              <label class="field">
                <span>Description</span>
                <input type="text" name="description" placeholder="Optional" />
              </label>
              <fieldset>
                <legend>Members</legend>
                <ClientPicker clients={allClients} selected={none} />
              </fieldset>
              <div class="form-foot">
                <span></span>
                <button class="btn" type="submit">
                  <Icon name="plus" />
                  Create group
                </button>
              </div>
            </form>
          </section>
        </div>
      </AdminShell>
    );
  };
}

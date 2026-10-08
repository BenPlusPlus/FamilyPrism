import type { Handle } from "remix/ui";

import { listClients } from "../../data/clients.ts";
import { listGroupsWithMembers } from "../../data/groups.ts";
import { routes } from "../../routes.ts";
import { Layout } from "../../ui/layout.tsx";
import { getNotice } from "../../utils/notice.ts";
import { renderNotice } from "./notice.tsx";

export function GroupsPage(
  handle: Handle<{
    allClients: Awaited<ReturnType<typeof listClients>>;
    groups: Awaited<ReturnType<typeof listGroupsWithMembers>>;
    notice: ReturnType<typeof getNotice>;
  }>,
) {
  let groupsCreateAction = routes.admin.groups.create.href();

  return () => (
    <Layout title="Groups">
      <h1>Groups</h1>
      <p>Create groups, manage membership, and send group messages.</p>
      {handle.props.notice ? renderNotice(handle.props.notice) : null}

      <section class="card">
        <h2>Create group</h2>
        <form method="post" action={groupsCreateAction} class="stack">
          <label>
            Name
            <input type="text" name="name" required />
          </label>
          <label>
            Description
            <textarea name="description" rows={2}></textarea>
          </label>
          <fieldset>
            <legend>Initial members</legend>
            <div class="checkbox-grid">
              {handle.props.allClients.map((client) => (
                <label>
                  <input type="checkbox" name="clientId" value={client.id} />{" "}
                  {client.name}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit">Create group</button>
        </form>
      </section>

      <div class="stack">
        {handle.props.groups.map((group) => {
          let memberIds = new Set(group.members.map((member) => member.id));

          return (
            <section class="card">
              <h2>{group.name}</h2>
              <p>{group.description || "No description."}</p>
              <p>
                Members:{" "}
                {group.members.length > 0
                  ? group.members.map((member) => member.name).join(", ")
                  : "None"}
              </p>
              <div class="card-grid">
                <form
                  method="post"
                  action={routes.admin.groups.members.href({
                    groupId: group.id,
                  })}
                  class="stack"
                >
                  <h3>Update membership</h3>
                  <div class="checkbox-grid">
                    {handle.props.allClients.map((client) => (
                      <label>
                        <input
                          type="checkbox"
                          name="clientId"
                          value={client.id}
                          checked={memberIds.has(client.id)}
                        />{" "}
                        {client.name}
                      </label>
                    ))}
                  </div>
                  <button type="submit">Save members</button>
                </form>

                <form
                  method="post"
                  action={routes.admin.messages.group.href({
                    groupId: group.id,
                  })}
                  class="stack"
                >
                  <h3>Send group message</h3>
                  <textarea
                    name="content"
                    rows={4}
                    placeholder="Message for every client in this group"
                    required
                  ></textarea>
                  <button type="submit">Send to group</button>
                </form>
              </div>
            </section>
          );
        })}
      </div>
    </Layout>
  );
}

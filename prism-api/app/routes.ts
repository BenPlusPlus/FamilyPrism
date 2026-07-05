import { form, get, post, route } from "remix/fetch-router/routes";

export const routes = route({
  assets: get("/assets/*path"),
  home: get("/"),
  websocket: get("/ws"),
  auth: route("auth", {
    login: form("login"),
    setup: form("setup"),
    logout: post("logout"),
  }),
  admin: route("admin", {
    index: get("/"),
    clients: route("clients", {
      index: get("/"),
      detail: get(":clientId"),
      screenshot: get(":clientId/screenshot"),
      delete: post(":clientId/delete"),
    }),
    groups: route("groups", {
      index: get("/"),
      create: post("/"),
      members: post(":groupId/members"),
    }),
    messages: route("messages", {
      client: post("client/:clientId"),
      group: post("group/:groupId"),
    }),
    screenshots: route("screenshots", {
      client: post("client/:clientId"),
    }),
  }),
  api: route("api", {
    auth: "auth/*path",
    clients: route("clients", {
      register: post("register"),
      screenshot: post(":clientId/screenshot"),
    }),
  }),
});

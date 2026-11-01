import { form, get, post, route } from "remix/fetch-router/routes";

export const routes = route({
  assets: get("/assets/*path"),
  fonts: get("/fonts/:file"),
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
      applyDns: post(":clientId/dns"),
      resetDns: post(":clientId/dns/reset"),
      delete: post(":clientId/delete"),
    }),
    groups: route("groups", {
      index: get("/"),
      create: post("/"),
      members: post(":groupId/members"),
    }),
    messages: route("messages", {
      compose: post("compose"),
      client: post("client/:clientId"),
      group: post("group/:groupId"),
    }),
    screenshots: route("screenshots", {
      client: post("client/:clientId"),
    }),
    settings: route("settings", {
      index: get("/"),
      dnsProfiles: route("dns-profiles", {
        index: get("/"),
        create: post("/"),
        update: post(":profileId"),
        delete: post(":profileId/delete"),
      }),
    }),
  }),
  api: route("api", {
    auth: "auth/*path",
    clients: route("clients", {
      register: post("register"),
      screenshot: post(":clientId/screenshot"),
      dnsResult: post(":clientId/dns/result"),
      update: get(":clientId/update"),
    }),
  }),
});

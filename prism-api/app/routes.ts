import { form, get, post, route } from "remix/routes";

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
      extendDns: post(":clientId/dns/extend"),
      resetDns: post(":clientId/dns/reset"),
      delete: post(":clientId/delete"),
      clearHistory: post(":clientId/history/clear"),
    }),
    groups: route("groups", {
      index: get("/"),
      create: post("/"),
      members: post(":groupId/members"),
    }),
    history: route("history", {
      index: get("/"),
      delete: post(":visitId/delete"),
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
      visitRetention: post("visit-retention"),
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
      visits: post(":clientId/visits"),
      dnsResult: post(":clientId/dns/result"),
      update: get(":clientId/update"),
    }),
  }),
});

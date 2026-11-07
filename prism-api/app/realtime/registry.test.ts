import assert from "node:assert/strict";
import test from "node:test";

import type { WebSocket } from "ws";

import { ClientConnectionRegistry } from "./registry.ts";

function createSocket() {
  let sent: string[] = [];
  let closeCount = 0;
  let socket = {
    readyState: 1,
    close() {
      closeCount += 1;
    },
    send(payload: string) {
      sent.push(payload);
    },
  } as unknown as WebSocket;

  return { closeCount: () => closeCount, sent, socket };
}

test("registry tracks connection state by client id", () => {
  let registry = new ClientConnectionRegistry();
  let { socket } = createSocket();

  registry.register("client-1", socket);
  assert.equal(registry.isClientConnected("client-1"), true);
  assert.equal(registry.countConnectedClients(), 1);

  registry.unregister("client-1", socket);
  assert.equal(registry.isClientConnected("client-1"), false);
  assert.equal(registry.countConnectedClients(), 0);
});

test("registry sends display messages to connected clients", () => {
  let registry = new ClientConnectionRegistry();
  let { sent, socket } = createSocket();

  registry.register("client-1", socket);
  let delivered = registry.sendDisplayMessage("client-1", {
    messageId: "msg-1",
    text: "Hello client",
    type: "display-message",
  });

  assert.equal(delivered, true);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /Hello client/);
});

test("registry sends take-screenshot commands to connected clients", () => {
  let registry = new ClientConnectionRegistry();
  let { sent, socket } = createSocket();

  registry.register("client-1", socket);
  let delivered = registry.sendTakeScreenshotCommand("client-1");

  assert.equal(delivered, true);
  assert.deepEqual(sent, ['{"type":"take-screenshot"}']);
});

test("registry sends apply-dns overlay commands with a deadline and standing DNS", () => {
  let registry = new ClientConnectionRegistry();
  let { sent, socket } = createSocket();

  registry.register("client-1", socket);
  let delivered = registry.sendApplyDnsCommand("client-1", {
    commandId: "dns-2",
    expiresAt: "2026-03-01T12:15:00.000Z",
    primaryIp: "8.8.8.8",
    profileName: "Open",
    resetToDhcp: false,
    restoreCommandId: "restore-2",
    secondaryIp: "8.8.4.4",
    standing: {
      primaryIp: "1.1.1.1",
      profileName: "School",
      resetToDhcp: false,
      secondaryIp: "1.0.0.1",
    },
    type: "apply-dns",
  });

  assert.equal(delivered, true);
  assert.deepEqual(JSON.parse(sent[0]), {
    commandId: "dns-2",
    expiresAt: "2026-03-01T12:15:00.000Z",
    primaryIp: "8.8.8.8",
    profileName: "Open",
    resetToDhcp: false,
    restoreCommandId: "restore-2",
    secondaryIp: "8.8.4.4",
    standing: {
      primaryIp: "1.1.1.1",
      profileName: "School",
      resetToDhcp: false,
      secondaryIp: "1.0.0.1",
    },
    type: "apply-dns",
  });
});

test("registry sends apply-dns commands to connected clients", () => {
  let registry = new ClientConnectionRegistry();
  let { sent, socket } = createSocket();

  registry.register("client-1", socket);
  let delivered = registry.sendApplyDnsCommand("client-1", {
    commandId: "dns-1",
    primaryIp: "1.1.1.1",
    profileName: "Cloudflare",
    resetToDhcp: false,
    secondaryIp: "1.0.0.1",
    type: "apply-dns",
  });

  assert.equal(delivered, true);
  assert.deepEqual(JSON.parse(sent[0]), {
    commandId: "dns-1",
    primaryIp: "1.1.1.1",
    profileName: "Cloudflare",
    resetToDhcp: false,
    secondaryIp: "1.0.0.1",
    type: "apply-dns",
  });
});

test("registry sends standing History collection as client-state", () => {
  let registry = new ClientConnectionRegistry();
  let { sent, socket } = createSocket();

  registry.register("client-1", socket);
  let delivered = registry.sendClientState("client-1", false);

  assert.equal(delivered, true);
  assert.deepEqual(JSON.parse(sent[0]), {
    historyCollection: false,
    type: "client-state",
  });
});

test("registry reports offline delivery when no socket is connected", () => {
  let registry = new ClientConnectionRegistry();

  let delivered = registry.sendDisplayMessage("client-404", {
    messageId: "msg-2",
    text: "No listeners",
    type: "display-message",
  });

  assert.equal(delivered, false);
});

test("registry disconnects all live sockets for a client", () => {
  let registry = new ClientConnectionRegistry();
  let first = createSocket();
  let second = createSocket();

  registry.register("client-1", first.socket);
  registry.register("client-1", second.socket);

  let disconnectedCount = registry.disconnectClient("client-1");

  assert.equal(disconnectedCount, 2);
  assert.equal(first.closeCount(), 1);
  assert.equal(second.closeCount(), 1);
  assert.equal(registry.isClientConnected("client-1"), false);
});

import { once } from "node:events";
import { expect, it } from "vitest";
import { WebSocket } from "ws";
import { createSignalingServer } from "../src/server.ts";

it("denies anonymous TURN credential requests", async () => {
  const server = await createSignalingServer({ port: 0 });
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/ice?room=hello`);
    expect(response.status).toBe(401);
  } finally {
    await server.close();
  }
});

it("issues a private ICE lease only for an explicit room member", async () => {
  const server = await createSignalingServer({
    port: 0,
    roomMembers: { hello: ["alice", "bob"] },
    turn: { secret: "a".repeat(64), urls: ["turn:turn.example.com:3478?transport=udp"] },
  });
  try {
    const url = `http://127.0.0.1:${server.port}/api/ice?room=hello`;
    const allowed = await fetch(url, { headers: { "Remote-User": "alice" } });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("cache-control")).toBe("private, no-store");
    const lease = await allowed.json();
    expect(lease.iceServers[0].urls).toEqual(["turn:turn.example.com:3478?transport=udp"]);
    expect(lease.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(JSON.stringify(lease)).not.toContain("alice");
    expect(JSON.stringify(lease)).not.toContain("a".repeat(64));
    expect((await fetch(url, { headers: { "Remote-User": "mallory" } })).status).toBe(403);
    expect((await fetch(`${url}-other`, { headers: { "Remote-User": "alice" } })).status).toBe(403);
  } finally {
    await server.close();
  }
});

it("rejects an anonymous WebSocket upgrade before allocating a client", async () => {
  const server = await createSignalingServer({
    port: 0,
    allowedOrigins: ["https://calls.example.com"],
  });
  try {
    const client = new WebSocket(server.url, { origin: "https://calls.example.com" });
    client.on("error", () => {});
    const status = await new Promise<number>((resolve) => {
      client.once("open", () => {
        client.terminate();
        resolve(101);
      });
      client.once("unexpected-response", (request, response) => {
        request.destroy();
        resolve(response.statusCode ?? 0);
      });
    });
    expect(status).toBe(403);
  } finally {
    await server.close();
  }
});

it("authorizes WebSocket room membership using the same policy as ICE issuance", async () => {
  const server = await createSignalingServer({
    port: 0,
    roomMembers: { hello: ["alice", "bob"] },
    allowedOrigins: ["https://calls.example.com"],
  });
  const clients: WebSocket[] = [];
  try {
    for (const [user, expected] of [
      ["alice", "waiting"],
      ["mallory", "error"],
    ]) {
      const client = new WebSocket(server.url, {
        origin: "https://calls.example.com",
        headers: { "Remote-User": user },
      });
      clients.push(client);
      await once(client, "open");
      const next = once(client, "message");
      client.send(JSON.stringify({ kind: "join", room: "hello" }));
      const [frame] = await next;
      const result = JSON.parse(String(frame));
      expect(result.kind).toBe(expected);
      if (user === "mallory") expect(result.code).toBe("FORBIDDEN");
    }
  } finally {
    for (const client of clients) client.terminate();
    await server.close();
  }
});

it("bounds credential issuance per authenticated subject and resets the window", async () => {
  let now = 1700000000000;
  const server = await createSignalingServer({
    port: 0,
    roomMembers: { hello: ["alice"] },
    turn: { secret: "a".repeat(64), urls: ["turn:turn.example.com:3478?transport=udp"] },
    issuanceLimit: 2,
    now: () => now,
  });
  try {
    const request = () =>
      fetch(`http://127.0.0.1:${server.port}/api/ice?room=hello`, {
        headers: { "Remote-User": "alice" },
      });
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(429);
    now += 60000;
    expect((await request()).status).toBe(200);
  } finally {
    await server.close();
  }
});

it("ends a room session before credentials can be used indefinitely", async () => {
  const server = await createSignalingServer({
    port: 0,
    roomMembers: { hello: ["alice"] },
    allowedOrigins: ["https://calls.example.com"],
    sessionTtlMs: 30,
  });
  const client = new WebSocket(server.url, {
    origin: "https://calls.example.com",
    headers: { "Remote-User": "alice" },
  });
  try {
    await once(client, "open");
    const closed = once(client, "close");
    client.send(JSON.stringify({ kind: "join", room: "hello" }));
    const [code] = await Promise.race([
      closed,
      new Promise<unknown[]>((resolve) => setTimeout(() => resolve([0]), 200)),
    ]);
    expect(code).toBe(1008);
  } finally {
    client.terminate();
    await server.close();
  }
});

it("rejects invalid request boundaries without treating inherited object keys as rooms", async () => {
  const server = await createSignalingServer({
    port: 0,
    roomMembers: { hello: ["alice"] },
    allowedOrigins: ["https://calls.example.com"],
    turn: { secret: "a".repeat(64), urls: ["turn:turn.example.com:3478?transport=udp"] },
  });
  try {
    const url = `http://127.0.0.1:${server.port}/api/ice?room=hello`;
    const headers = { "Remote-User": "alice" };
    expect(
      (await fetch(url, { headers: { ...headers, Origin: "https://evil.example" } })).status,
    ).toBe(403);
    expect((await fetch(url, { method: "POST", headers })).status).toBe(405);
    expect((await fetch(url.replace("hello", "toString"), { headers })).status).toBe(403);
    expect((await fetch(url, { headers: { "Remote-User": "alice,bob" } })).status).toBe(401);
    expect((await fetch(url, { headers: { ...headers, Remote_User: "mallory" } })).status).toBe(
      400,
    );
  } finally {
    await server.close();
  }
});

it("allows direct-only ICE configuration only in explicit loopback development", async () => {
  const server = await createSignalingServer({
    port: 0,
    development: true,
    roomMembers: { hello: ["developer"] },
  });
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/ice?room=hello`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      iceServers: [],
      mode: "development",
      iceTransportPolicy: "all",
    });
    await expect(createSignalingServer({ development: true, host: "0.0.0.0" })).rejects.toThrow(
      "loopback",
    );
  } finally {
    await server.close();
  }
});

import { once } from "node:events";
import { expect, it } from "vitest";
import { WebSocket } from "ws";
import { createSignalingServer } from "../src/server.ts";

const origin = "https://calls.example.com";
async function connect(url: string) {
  const socket = new WebSocket(url, { origin, headers: { "Remote-User": "alice" } });
  await once(socket, "open");
  return socket;
}
async function reply(socket: WebSocket, value: unknown) {
  const next = once(socket, "message");
  socket.send(JSON.stringify(value));
  const [frame] = await next;
  return JSON.parse(String(frame));
}
it("pairs authorized clients and forwards only their current-session frames", async () => {
  const server = await createSignalingServer({
    port: 0,
    roomMembers: { hello: ["alice"] },
    allowedOrigins: [origin],
  });
  const clients: WebSocket[] = [];
  try {
    const a = await connect(server.url),
      b = await connect(server.url),
      c = await connect(server.url);
    clients.push(a, b, c);
    expect(await reply(a, null)).toEqual({ kind: "error", code: "INVALID_MESSAGE" });
    expect(await reply(a, { kind: "unknown" })).toEqual({ kind: "error", code: "INVALID_MESSAGE" });
    for (const value of ["{", Buffer.from("binary")]) {
      const next = once(a, "message");
      a.send(value);
      expect(JSON.parse(String((await next)[0]))).toEqual({
        kind: "error",
        code: "INVALID_MESSAGE",
      });
    }
    expect(await reply(a, { kind: "join", room: "bad room" })).toEqual({
      kind: "error",
      code: "INVALID_ROOM",
    });
    expect(await reply(a, { kind: "join", room: "hello" })).toEqual({ kind: "waiting" });
    expect(await reply(a, { kind: "signal", sessionId: "missing", payload: {} })).toEqual({
      kind: "error",
      code: "SESSION_MISMATCH",
    });
    const aReady = once(a, "message");
    const second = await reply(b, { kind: "join", room: "hello" });
    const first = JSON.parse(String((await aReady)[0]));
    expect(first).toEqual({ kind: "ready", sessionId: second.sessionId, polite: false });
    expect(second.polite).toBe(true);
    expect(await reply(c, { kind: "join", room: "hello" })).toEqual({
      kind: "error",
      code: "ROOM_FULL",
    });
    expect(await reply(a, { kind: "join", room: "hello" })).toEqual({
      kind: "error",
      code: "INVALID_ROOM",
    });
    expect(await reply(a, { kind: "signal", sessionId: "stale", payload: {} })).toEqual({
      kind: "error",
      code: "SESSION_MISMATCH",
    });
    const forwarded = once(b, "message");
    a.send(
      JSON.stringify({ kind: "signal", sessionId: first.sessionId, payload: { example: "exact" } }),
    );
    expect(JSON.parse(String((await forwarded)[0]))).toEqual({
      kind: "signal",
      sessionId: first.sessionId,
      payload: { example: "exact" },
    });
    const peerLeft = once(a, "message");
    b.close();
    expect(JSON.parse(String((await peerLeft)[0]))).toEqual({ kind: "peer-left" });
    const aClosed = once(a, "close");
    a.close();
    await aClosed;
    expect(await reply(c, { kind: "join", room: "hello" })).toEqual({ kind: "waiting" });
    expect((await fetch(`http://127.0.0.1:${server.port}/health`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${server.port}/missing`)).status).toBe(404);
    expect(
      (
        await fetch(`http://127.0.0.1:${server.port}/api/ice?room=hello`, {
          headers: { "Remote-User": "alice" },
        })
      ).status,
    ).toBe(503);
  } finally {
    for (const socket of clients) socket.terminate();
    await server.close();
  }
});

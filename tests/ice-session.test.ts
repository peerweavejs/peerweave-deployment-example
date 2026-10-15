import { once } from "node:events";
import { createServer } from "node:http";
import { expect, it, vi } from "vitest";
import { createSignalingServer } from "../apps/server/src/server.ts";
import { IceSession } from "../apps/web/src/shared/ice.ts";

it("obtains room-authorized ICE configuration before a new peer session", async () => {
  const server = await createSignalingServer({
    port: 0,
    development: true,
    roomMembers: { hello: ["developer"] },
  });
  const session = new IceSession(`http://127.0.0.1:${server.port}/api/ice`);
  try {
    expect(await session.prepare("hello", () => {})).toEqual({
      iceServers: [],
      iceTransportPolicy: "all",
    });
    await expect(session.prepare("unauthorized", () => {})).rejects.toThrow("403");
  } finally {
    session.cancel();
    await server.close();
  }
});

it("rejects expired or malformed ICE leases instead of silently falling back", async () => {
  const now = 1700000000000;
  const valid = {
    mode: "turn",
    expiresAt: now / 1000 + 120,
    iceTransportPolicy: "relay",
    iceServers: [
      {
        urls: ["turns:turn.example.com:5349?transport=tcp"],
        username: "opaque",
        credential: "temporary",
      },
    ],
  };
  let value: unknown = valid;
  const http = createServer((_request, response) => response.end(JSON.stringify(value)));
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  const session = new IceSession(`http://127.0.0.1:${address.port}/api/ice`, () => now);
  try {
    expect(await session.prepare("hello", () => {})).toEqual({
      iceServers: valid.iceServers,
      iceTransportPolicy: "relay",
    });
    for (const invalid of [
      null,
      {},
      { ...valid, expiresAt: now / 1000 - 1 },
      { ...valid, iceServers: [] },
      { ...valid, iceTransportPolicy: "anything" },
      {
        ...valid,
        iceServers: [
          { urls: ["https://evil.example"], credential: "temporary", username: "opaque" },
        ],
      },
    ]) {
      value = invalid;
      await expect(session.prepare("hello", () => {})).rejects.toThrow("Invalid ICE lease");
    }
  } finally {
    session.cancel();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});

it("cancels pending setup when a participant leaves", async () => {
  let received: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    received = resolve;
  });
  let finish = () => {};
  const http = createServer((_request, response) => {
    finish = () => response.end("{}");
    received();
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  const session = new IceSession(`http://127.0.0.1:${address.port}/api/ice`);
  try {
    const pending = session.prepare("hello", () => {});
    await ready;
    session.cancel();
    await expect(pending).resolves.toBeNull();
  } finally {
    session.cancel();
    finish();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});

it("expires a lease before its TURN credential boundary and clears expiry on leave", async () => {
  const now = 1700000000000;
  const http = createServer((_request, response) =>
    response.end(
      JSON.stringify({
        mode: "development",
        iceServers: [],
        iceTransportPolicy: "all",
        expiresAt: now / 1000 + 61,
      }),
    ),
  );
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  const session = new IceSession(`http://127.0.0.1:${address.port}/api/ice`, () => now);
  let expired = 0;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    await session.prepare("hello", () => expired++);
    vi.advanceTimersByTime(1000);
    expect(expired).toBe(1);
    await session.prepare("hello", () => expired++);
    session.cancel();
    vi.advanceTimersByTime(1000);
    expect(expired).toBe(1);
  } finally {
    session.cancel();
    vi.useRealTimers();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  }
});

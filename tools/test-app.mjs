import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";
import { createSignalingServer } from "../apps/server/src/server.ts";

const root = resolve(import.meta.dirname, "..");
const turn = process.env.PEERWEAVE_TEST_TURN_SECRET_FILE
  ? {
      secret: (await readFile(process.env.PEERWEAVE_TEST_TURN_SECRET_FILE, "utf8")).trim(),
      urls: [process.env.PEERWEAVE_TEST_TURN_URL],
    }
  : undefined;
const backend = await createSignalingServer({
  port: 0,
  development: true,
  ...(turn ? { turn, iceTransportPolicy: "relay" } : {}),
  roomMembers: {
    hello: ["developer"],
    "files-hello": ["developer"],
    "support-hello": ["developer"],
  },
});
let web, browser;
async function until(check, label) {
  const deadline = Date.now() + 15000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
try {
  web = await preview({
    configFile: false,
    root: resolve(root, "apps/web"),
    preview: {
      host: "127.0.0.1",
      port: 0,
      proxy: {
        "/api": `http://127.0.0.1:${backend.port}`,
        "/signaling": { target: `ws://127.0.0.1:${backend.port}`, ws: true },
      },
    },
  });
  const origin = web.resolvedUrls.local[0];
  browser = await chromium.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      ...(turn ? ["--ignore-certificate-errors"] : []),
    ],
  });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const NativePeer = window.RTCPeerConnection;
    const connections = [];
    Reflect.set(window, "observedConnections", connections);
    window.RTCPeerConnection = class extends NativePeer {
      constructor(configuration) {
        super(configuration);
        connections.push(this);
      }
    };
  });
  const a = await context.newPage(),
    b = await context.newPage();
  const errors = [];
  for (const page of [a, b]) page.on("pageerror", (error) => errors.push(error.message));
  for (const path of ["/", "/support/", "/transfer/"]) {
    await a.goto(new URL(path, origin).href);
    const ice = [],
      sockets = [];
    const request = (value) => {
      if (value.url().includes("/api/ice?")) ice.push(value.url());
    };
    const socket = (value) => sockets.push(value.url());
    a.on("request", request);
    a.on("websocket", socket);
    await a.getByLabel("Room", { exact: true }).fill("unauthorized");
    await a.getByRole("button", { name: "Join room", exact: true }).click();
    await until(
      async () => (await a.locator("#feedback").textContent()).length > 0,
      "denied room feedback",
    );
    assert.equal(ice.length, 1, `${path}: authorize ICE before opening signaling`);
    assert.equal(sockets.length, 0, `${path}: denied lease must not open WebSocket`);
    assert.match(await a.locator("#feedback").textContent(), /403/);
    a.off("request", request);
    a.off("websocket", socket);
  }
  await Promise.all([a.goto(origin), b.goto(origin)]);
  for (const page of [a, b]) {
    await page.getByLabel("Room", { exact: true }).fill("hello");
    await page.getByRole("button", { name: "Join room", exact: true }).click();
  }
  await until(
    () => a.getByRole("button", { name: "Start call", exact: true }).isEnabled(),
    "pairing",
  );
  await Promise.all(
    [a, b].map((page) => page.getByRole("button", { name: "Start call", exact: true }).click()),
  );
  for (const page of [a, b]) {
    await until(
      async () => (await page.locator("#call-status").textContent()) === "active",
      "active call",
    );
    await until(
      () => page.locator("#remote").evaluate((video) => video.videoWidth > 0),
      "remote video",
    );
  }
  if (turn) {
    for (const page of [a, b]) {
      const types = await page.evaluate(async () => {
        const peers = Reflect.get(window, "observedConnections");
        return Promise.all(
          peers.map(async (peer) => {
            const stats = await peer.getStats();
            const pair = [...stats.values()].find(
              (item) =>
                item.type === "candidate-pair" && item.state === "succeeded" && item.nominated,
            );
            return stats.get(pair?.localCandidateId)?.candidateType;
          }),
        );
      });
      assert.ok(
        types.length > 0 && types.every((type) => type === "relay"),
        "The application must actually select relay candidates from its fetched ICE lease",
      );
    }
  }
  await a.getByLabel("Message", { exact: true }).fill("Independent packaged app");
  await a.getByRole("button", { name: "Send", exact: true }).click();
  await until(
    async () => (await b.locator("#messages").textContent()).includes("Independent packaged app"),
    "native chat",
  );
  await mkdir(resolve(root, ".artifacts"), { recursive: true });
  await a.screenshot({ path: resolve(root, ".artifacts/app-call.png"), fullPage: true });
  await a.getByRole("button", { name: "Hang up", exact: true }).click();
  for (const page of [a, b])
    await until(
      async () => (await page.locator("#call-status").textContent()) === "ended",
      "hangup",
    );
  await Promise.all([
    a.goto(new URL("/transfer/", origin).href),
    b.goto(new URL("/transfer/", origin).href),
  ]);
  for (const page of [a, b]) {
    await page.getByLabel("Room", { exact: true }).fill("hello");
    await page.getByRole("button", { name: "Join room", exact: true }).click();
  }
  for (const page of [a, b])
    await until(
      async () => (await page.locator("#connection-status").textContent()) === "connected",
      "file channel",
    );
  const bytes = Buffer.from("Exact bytes through installed Peerweave APIs");
  await a
    .getByLabel("File to send")
    .setInputFiles({ name: "example.txt", mimeType: "text/plain", buffer: bytes });
  await a.getByRole("button", { name: "Offer file", exact: true }).click();
  await b.getByRole("button", { name: "Accept file", exact: true }).click();
  await until(
    async () => (await b.locator("#transfer-status").textContent()) === "complete",
    "file completion",
  );
  const download = b.waitForEvent("download");
  await b.getByRole("link", { name: "Download example.txt", exact: true }).click();
  assert.deepEqual(await readFile(await (await download).path()), bytes);
  await b.screenshot({ path: resolve(root, ".artifacts/app-transfer.png"), fullPage: true });
  await a.goto(new URL("/media/", origin).href);
  await a.getByRole("main").waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Application smoke passed: packaged APIs, four built pages, denied ICE without signaling, native video/chat/hangup and exact file bytes.",
  );
} finally {
  await browser?.close();
  if (web)
    await new Promise((resolve, reject) =>
      web.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  await backend.close();
}

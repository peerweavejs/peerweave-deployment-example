import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const project = `peerweave-smoke-${randomUUID()}`;
const directory = await mkdtemp(join(tmpdir(), "peerweave-deployment-"));
const override = join(directory, "compose.yaml");
const edgeOverride = join(directory, "edge.yaml");
const edgeProject = `${project}-edge`;
const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: project,
  PEERWEAVE_DOMAIN: "localhost",
  PEERWEAVE_IMAGE_PREFIX: process.env.PEERWEAVE_IMAGE_PREFIX ?? "peerweave-example",
  PEERWEAVE_IMAGE_TAG: process.env.PEERWEAVE_IMAGE_TAG ?? "local",
  TRAEFIK_NETWORK: project,
  TRAEFIK_ENTRYPOINT: "websecure",
  TRAEFIK_CERT_RESOLVER: "",
  TRAEFIK_MIDDLEWARES: "",
  ROOM_POLICY_FILE: join(directory, "rooms.json"),
  TURN_AUTH_SECRET_FILE: join(directory, "turn-secret"),
  TURN_URLS: "turn:turn.example.com:3478?transport=udp",
};
const docker = (args) => execFileSync("docker", args, { cwd: root, env, encoding: "utf8" }).trim();
const compose = (...args) => docker(["compose", "-f", "compose.yaml", "-f", override, ...args]);
const edge = (...args) =>
  docker([
    "compose",
    "--project-name",
    edgeProject,
    "-f",
    "compose.traefik.yaml",
    "-f",
    edgeOverride,
    ...args,
  ]);
let network = false;
let proxy = false;
let deployment = false;
let browser;

async function until(check, description) {
  const deadline = Date.now() + 30000;
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

try {
  await writeFile(env.ROOM_POLICY_FILE, JSON.stringify({ "deployment-smoke": ["smoke"] }));
  await writeFile(env.TURN_AUTH_SECRET_FILE, "a".repeat(64));
  const model = JSON.parse(docker(["compose", "-f", "compose.yaml", "config", "--format", "json"]));
  for (const service of Object.values(model.services)) {
    assert.equal(service.build, undefined, "Compose must deploy prebuilt images");
    assert.equal(service.ports, undefined, "Only Traefik publishes ports");
  }
  const endpoint =
    process.env.DOCKER_HOST ??
    docker(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]);
  assert.ok(
    endpoint.startsWith("unix://"),
    "The deployment smoke test needs a local Unix Docker socket",
  );
  const socket = decodeURIComponent(new URL(endpoint).pathname);
  assert.ok((await stat(socket)).isSocket(), "Docker endpoint must be an existing Unix socket");
  docker(["network", "create", project]);
  network = true;
  const password = randomUUID();
  const hash = execFileSync("openssl", ["passwd", "-apr1", "-stdin"], {
    input: password,
    encoding: "utf8",
  }).trim();
  const users = join(directory, "users");
  await writeFile(users, `smoke:${hash}\n`);
  env.DOCKER_SOCKET_PATH = socket;
  env.TRAEFIK_USERS_FILE = users;
  env.TURN_DOMAIN = "";
  await writeFile(
    edgeOverride,
    'services:\n  traefik:\n    ports: !override\n      - "127.0.0.1::8080"\n      - "127.0.0.1::8443"\n',
  );
  proxy = true;
  edge("up", "--detach", "--wait", "--wait-timeout", "60");
  edge("run", "--rm", "--no-deps", "acme-init");
  const proxyId = edge("ps", "--quiet", "traefik");
  assert.notEqual(docker(["exec", proxyId, "id", "-u"]), "0");
  assert.equal(
    docker(["exec", proxyId, "stat", "-c", "%a:%u", "/letsencrypt/acme.json"]),
    "600:65532",
  );
  const port = docker(["port", proxyId, "8443/tcp"]).split(":").at(-1);
  const origin = `https://localhost:${port}`;
  await writeFile(
    override,
    JSON.stringify({
      services: {
        signaling: {
          environment: {
            PEERWEAVE_ALLOWED_ORIGINS: origin,
          },
        },
      },
    }),
  );
  deployment = true;
  compose("up", "--detach", "--wait", "--wait-timeout", "60", "--pull", "never");
  for (const service of ["web", "signaling"]) {
    const id = compose("ps", "--quiet", service);
    assert.equal(docker(["inspect", "--format", "{{.State.Health.Status}}", id]), "healthy");
    assert.notEqual(docker(["exec", id, "id", "-u"]), "0");
    assert.equal(docker(["inspect", "--format", "{{.HostConfig.ReadonlyRootfs}}", id]), "true");
  }

  browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    httpCredentials: { username: "smoke", password },
  });
  const a = await context.newPage();
  const b = await context.newPage();
  const errors = [];
  for (const page of [a, b]) page.on("pageerror", (error) => errors.push(error.message));
  await until(async () => {
    const response = await context.request.get(`${origin}/health`);
    return response.ok();
  }, "Traefik routing");
  await until(async () => {
    const response = await context.request.get(`${origin}/signaling`);
    return (await response.text()).includes('"service":"peerweave-signaling"');
  }, "Traefik signaling routing");
  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true });
  assert.equal((await anonymous.request.get(`${origin}/`)).status(), 401);
  assert.equal((await anonymous.request.get(`${origin}/signaling`)).status(), 401);
  assert.equal(
    (await anonymous.request.get(`${origin}/api/ice?room=deployment-smoke`)).status(),
    401,
  );
  await anonymous.close();
  const authorizedLease = await context.request.get(`${origin}/api/ice?room=deployment-smoke`);
  assert.equal(authorizedLease.status(), 200);
  assert.equal(authorizedLease.headers()["cache-control"], "private, no-store");
  const lease = await authorizedLease.json();
  assert.ok(lease.iceServers[0].credential);
  assert.ok(!JSON.stringify(lease).includes("smoke"));
  assert.equal((await context.request.get(`${origin}/api/ice?room=unauthorized`)).status(), 403);
  assert.equal(
    (await context.request.get(`${origin}/`, { headers: { Remote_User: "spoofed" } })).status(),
    400,
  );
  assert.equal((await context.request.get(`${origin}/bad%2fpath`)).status(), 400);
  const apiProxy = edge("ps", "--quiet", "docker-api");
  for (const args of [
    ["-S", "-O", "/dev/null", "--post-data={}", "http://127.0.0.1:2375/_ping"],
    ["-S", "-O", "/dev/null", "http://127.0.0.1:2375/secrets"],
    ["-S", "-O", "/dev/null", "http://127.0.0.1:2375/containers/not-a-container/archive?path=/"],
  ]) {
    let denied = "";
    try {
      docker(["exec", apiProxy, "wget", ...args]);
    } catch (error) {
      denied = error.stderr?.toString() ?? "";
    }
    assert.match(denied, /403 Forbidden/, "Docker API writes and secrets must be blocked");
  }
  for (const path of ["/", "/media/", "/transfer/", "/support/"]) {
    const response = await a.goto(`${origin}${path}`);
    assert.equal(response.status(), 200);
    await a.getByRole("main").waitFor();
  }
  const missing = await context.request.get(`${origin}/missing.js`);
  assert.equal(missing.status(), 404);
  const blocked = await context.request.get(`${origin}/signaling`, {
    headers: {
      Origin: "https://untrusted.example",
      Connection: "Upgrade",
      Upgrade: "websocket",
      "Sec-WebSocket-Version": "13",
      "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
    },
  });
  assert.equal(blocked.status(), 403);

  const transports = [];
  a.on("websocket", (socket) => transports.push(socket.url()));
  await Promise.all([a.goto(origin), b.goto(origin)]);
  for (const page of [a, b]) {
    await page.getByLabel("Room").fill("deployment-smoke");
    await page.getByRole("button", { name: "Join room", exact: true }).click();
  }
  await until(
    () => a.getByRole("button", { name: "Start call", exact: true }).isEnabled(),
    "WSS pairing",
  );
  assert.deepEqual(transports, [`${origin.replace("https:", "wss:")}/signaling`]);
  await Promise.all(
    [a, b].map((page) => page.getByRole("button", { name: "Start call", exact: true }).click()),
  );
  for (const page of [a, b]) {
    await until(
      async () => (await page.locator("#call-status").textContent()) === "active",
      "native call",
    );
    await until(
      () => page.locator("#remote").evaluate((video) => video.videoWidth > 0),
      "remote video",
    );
  }
  await a.getByLabel("Message").fill("Hello through Traefik TLS");
  await a.getByRole("button", { name: "Send", exact: true }).click();
  await until(
    async () => (await b.locator("#messages").textContent()).includes("Hello through Traefik TLS"),
    "native chat",
  );
  await a.getByRole("button", { name: "Hang up", exact: true }).click();
  for (const page of [a, b]) {
    await until(
      async () => (await page.locator("#call-status").textContent()) === "ended",
      "hangup",
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "Deployment smoke passed: standalone non-root Traefik, authentication, restricted Docker API, healthy non-root app containers, four HTTPS pages, rejected origin, WSS pairing, native video/chat and hangup.",
  );
} catch (error) {
  if (deployment) {
    try {
      console.error(compose("logs", "--no-color", "--tail", "30"));
    } catch {
      /* Retain the original failure. */
    }
  }
  if (proxy) console.error(edge("logs", "--no-color", "--tail", "30"));
  throw error;
} finally {
  await browser?.close();
  if (deployment) compose("down", "--remove-orphans");
  if (proxy) edge("down", "--volumes", "--remove-orphans");
  if (network) docker(["network", "rm", project]);
  await rm(directory, { recursive: true, force: true });
}

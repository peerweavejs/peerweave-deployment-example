import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer as createTcpServer } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { connect as connectTls } from "node:tls";
import { chromium } from "playwright";
import { createServer } from "vite";
import { issueTurnCredentials } from "../apps/server/src/turn-credentials.mjs";

const root = resolve(import.meta.dirname, "..");
const project = `peerweave-turn-smoke-${randomUUID()}`;
const directory = await mkdtemp(join(tmpdir(), "peerweave-turn-smoke-"));
const override = join(directory, "override.json");
const secret = randomBytes(32).toString("hex");
const cert = join(directory, "fullchain.pem");
const key = join(directory, "privkey.pem");
const common = join(directory, "turnserver.conf");
const env = {
  ...process.env,
  TURN_DOMAIN: "localhost",
  TURN_LISTEN_IP: "0.0.0.0",
  TURN_RELAY_IP: "127.0.0.1",
  TURN_PUBLIC_IP: "127.0.0.1",
  TURN_TLS_DIR: directory,
  TURN_AUTH_SECRET_FILE: join(directory, "secret"),
  TURN_MIN_PORT: "50000",
  TURN_MAX_PORT: "50099",
  TURN_USER_QUOTA: "8",
  TURN_TOTAL_QUOTA: "50",
};
const args = (...items) => [
  "compose",
  "--project-name",
  project,
  "-f",
  "compose.turn.yaml",
  "-f",
  override,
  ...items,
];
const compose = (...items) =>
  execFileSync("docker", args(...items), { cwd: root, env, encoding: "utf8" }).trim();
let started = false;
let browser;
let vite;
let edgeStarted = false;
let edgeNetwork = false;
const edgeOverride = join(directory, "edge.yaml");
const edgeProject = `${project}-edge`;
const edge = (...items) =>
  execFileSync(
    "docker",
    [
      "compose",
      "--project-name",
      edgeProject,
      "-f",
      "compose.traefik.yaml",
      "-f",
      edgeOverride,
      ...items,
    ],
    { cwd: root, env, encoding: "utf8" },
  ).trim();

async function freePort() {
  const socket = createTcpServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

try {
  env.TURN_PORT = String(await freePort());
  env.TURN_TLS_PORT = String(await freePort());
  env.TURN_METRICS_PORT = String(await freePort());
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "2",
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost,IP:127.0.0.1",
      "-keyout",
      key,
      "-out",
      cert,
    ],
    { stdio: "pipe" },
  );
  await chmod(directory, 0o755);
  await chmod(key, 0o644); // Ephemeral fixture only; production key permissions are documented separately.
  await writeFile(env.TURN_AUTH_SECRET_FILE, secret);
  const policy = await readFile(join(root, "deploy/turn/turnserver.conf"), "utf8");
  await writeFile(common, policy);
  await writeFile(
    override,
    JSON.stringify({
      services: {
        coturn: {
          restart: "no",
          volumes: [
            {
              type: "bind",
              source: common,
              target: "/opt/peerweave-turn/turnserver.conf",
              read_only: true,
            },
          ],
        },
      },
    }),
  );
  const badSecret = join(directory, "bad-secret");
  await writeFile(badSecret, "too-short");
  const refused = spawnSync("docker", args("run", "--rm", "--no-deps", "coturn"), {
    cwd: root,
    env: { ...env, TURN_AUTH_SECRET_FILE: badSecret },
    encoding: "utf8",
  });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stdout + refused.stderr, /shared secret must be 64/);
  const wrongHostname = spawnSync("docker", args("run", "--rm", "--no-deps", "coturn"), {
    cwd: root,
    env: { ...env, TURN_DOMAIN: "wrong.example" },
    encoding: "utf8",
  });
  assert.notEqual(wrongHostname.status, 0);
  assert.match(wrongHostname.stdout + wrongHostname.stderr, /TLS certificate hostname mismatch/);
  started = true;
  compose("up", "--detach", "--wait", "--wait-timeout", "45");
  const id = compose("ps", "--quiet", "coturn");
  assert.equal(
    execFileSync("docker", ["exec", id, "id", "-u"], { encoding: "utf8" }).trim(),
    "24001",
  );
  assert.equal(
    execFileSync("docker", ["inspect", "--format", "{{.State.Health.Status}}", id], {
      encoding: "utf8",
    }).trim(),
    "healthy",
  );
  const tls = connectTls({
    host: "127.0.0.1",
    port: Number(env.TURN_TLS_PORT),
    servername: "localhost",
    ca: await readFile(cert),
  });
  tls.setTimeout(5000, () => tls.destroy(new Error("Direct TURN TLS handshake timed out")));
  await once(tls, "secureConnect");
  assert.equal(tls.authorized, true);
  tls.destroy();
  const metrics = await fetch(`http://127.0.0.1:${env.TURN_METRICS_PORT}/metrics`);
  assert.equal(metrics.status, 200);

  vite = await createServer({
    configFile: false,
    root: join(root, "apps/web"),
    server: { host: "127.0.0.1", port: 0 },
  });
  vite.middlewares.use((request, response, next) => {
    if (request.url !== "/") return next();
    response.setHeader("content-type", "text/html");
    response.end("<!doctype html><title>TURN deployment contract</title>");
  });
  await vite.listen();
  browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors"] });
  const page = await browser.newPage();
  await page.goto(vite.resolvedUrls.local[0]);
  const endpoints = [
    `turn:127.0.0.1:${env.TURN_PORT}?transport=udp`,
    `turn:127.0.0.1:${env.TURN_PORT}?transport=tcp`,
    `turns:127.0.0.1:${env.TURN_TLS_PORT}?transport=tcp`,
  ];
  async function gather(iceServers) {
    return page.evaluate(async (servers) => {
      const peer = new RTCPeerConnection({ iceServers: servers, iceTransportPolicy: "relay" });
      try {
        peer.createDataChannel("gather");
        const candidates = [];
        const complete = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("ICE gathering timed out")), 15000);
          peer.onicecandidate = ({ candidate }) => {
            if (candidate) candidates.push(candidate.type);
            else {
              clearTimeout(timeout);
              resolve(candidates);
            }
          };
        });
        await peer.setLocalDescription(await peer.createOffer());
        return await complete;
      } finally {
        peer.close();
      }
    }, iceServers);
  }
  for (const url of endpoints) {
    const issued = issueTurnCredentials({ secret, subject: "contract", urls: [url] });
    assert.ok((await gather(issued.iceServers)).includes("relay"), `Valid REST allocation: ${url}`);
  }
  for (const invalid of [
    issueTurnCredentials({ secret: "b".repeat(64), subject: "wrong", urls: [endpoints[0]] }),
    issueTurnCredentials({
      secret,
      subject: "expired",
      urls: [endpoints[0]],
      now: Math.floor(Date.now() / 1000) - 1000,
      ttlSeconds: 60,
    }),
  ])
    assert.ok(!(await gather(invalid.iceServers)).includes("relay"));
  const deniedCredentials = issueTurnCredentials({
    secret,
    subject: "denied",
    urls: [endpoints[0]],
  }).iceServers[0];
  const denied = spawnSync(
    "docker",
    [
      "exec",
      id,
      "timeout",
      "8",
      "turnutils_uclient",
      "-t",
      "-y",
      "-m",
      "1",
      "-n",
      "1",
      "-u",
      deniedCredentials.username,
      "-w",
      deniedCredentials.credential,
      "-p",
      env.TURN_PORT,
      "127.0.0.1",
    ],
    { encoding: "utf8" },
  );
  assert.match(
    denied.stdout + denied.stderr,
    /403|Forbidden/,
    "Production policy must deny loopback peers",
  );
  const metadataDenied = spawnSync(
    "docker",
    [
      "exec",
      id,
      "timeout",
      "8",
      "turnutils_uclient",
      "-t",
      "-m",
      "1",
      "-n",
      "1",
      "-u",
      deniedCredentials.username,
      "-w",
      deniedCredentials.credential,
      "-p",
      env.TURN_PORT,
      "-e",
      "169.254.169.254",
      "-r",
      "80",
      "127.0.0.1",
    ],
    { encoding: "utf8" },
  );
  assert.match(
    metadataDenied.stdout + metadataDenied.stderr,
    /403|Forbidden/,
    "Production policy must deny link-local metadata peers",
  );

  // Positive loopback exchange is impossible with the production SSRF policy. Scope the exception to this temporary fixture.
  compose("stop", "coturn");
  await writeFile(
    common,
    policy.replace("denied-peer-ip=127.0.0.0-127.255.255.255", "") +
      "\nallow-loopback-peers\ncli-password=fixture-only\n",
  );
  compose("up", "--detach", "--force-recreate", "--wait", "--wait-timeout", "45");
  // Exercise the provided SNI passthrough on a separate temporary public-facing port.
  const socketEndpoint =
    process.env.DOCKER_HOST ??
    execFileSync("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], {
      encoding: "utf8",
    }).trim();
  assert.ok(socketEndpoint.startsWith("unix://"));
  env.DOCKER_SOCKET_PATH = new URL(socketEndpoint).pathname;
  env.TRAEFIK_NETWORK = edgeProject;
  env.TRAEFIK_USERS_FILE = join(directory, "users");
  await writeFile(env.TRAEFIK_USERS_FILE, "fixture:{SHA}W6ph5Mm5Pz8GgiULbPgzG37mj9g=\n"); // No HTTP routes are used in this fixture.
  const securityOptions = execFileSync(
    "docker",
    ["info", "--format", "{{json .SecurityOptions}}"],
    { encoding: "utf8" },
  );
  const rootlessAddress = Object.values(networkInterfaces())
    .flat()
    .find((address) => address.family === "IPv4" && !address.internal)?.address;
  const backend =
    process.env.PEERWEAVE_TEST_TURN_HOST ??
    (securityOptions.includes("rootless") ? rootlessAddress : "host.docker.internal");
  assert.ok(backend, "A host address reachable from Docker is required for TURN passthrough");
  env.TURN_BACKEND = `${backend}:${env.TURN_TLS_PORT}`;
  await writeFile(
    edgeOverride,
    'services:\n  traefik:\n    ports: !override\n      - "127.0.0.1::8443"\n',
  );
  execFileSync("docker", ["network", "create", edgeProject], { stdio: "pipe" });
  edgeNetwork = true;
  edgeStarted = true;
  edge("up", "--detach", "--wait", "--wait-timeout", "60");
  const proxy = edge("ps", "--quiet", "traefik");
  const publicTlsPort = execFileSync("docker", ["port", proxy, "8443/tcp"], { encoding: "utf8" })
    .trim()
    .split(":")
    .at(-1);
  const forwarded = connectTls({
    host: "127.0.0.1",
    port: Number(publicTlsPort),
    servername: "localhost",
    ca: await readFile(cert),
  });
  forwarded.setTimeout(5000, () =>
    forwarded.destroy(new Error("Forwarded TURN TLS handshake timed out")),
  );
  await once(forwarded, "secureConnect");
  assert.equal(forwarded.authorized, true, "SNI route must present Coturn's certificate");
  forwarded.destroy();
  endpoints.push(`turns:localhost:${publicTlsPort}?transport=tcp`);
  for (const url of endpoints) {
    const configuration = {
      iceTransportPolicy: "relay",
      iceServers: issueTurnCredentials({ secret, subject: "exchange", urls: [url] }).iceServers,
    };
    const result = await page.evaluate(async (config) => {
      const { createPeer } = await import("/tests/turn-client.ts");
      const errors = [],
        received = [];
      let offers = 0;
      const a = createPeer({
        sessionId: "turn-production-contract",
        polite: false,
        rtcConfiguration: config,
        sendSignal: (signal) => {
          if (signal.kind === "description" && signal.description.type === "offer") offers++;
          return b.receiveSignal(signal);
        },
      });
      const b = createPeer({
        sessionId: "turn-production-contract",
        polite: true,
        rtcConfiguration: config,
        sendSignal: (signal) => a.receiveSignal(signal),
      });
      a.on("error", (error) => errors.push(error.message));
      b.on("error", (error) => errors.push(error.message));
      b.on("datachannel", ({ channel }) => {
        channel.onmessage = ({ data }) => received.push(data);
      });
      const until = async (ready) => {
        const deadline = Date.now() + 15000;
        while (!ready()) {
          if (Date.now() > deadline) throw new Error("TURN data exchange timed out");
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      };
      try {
        const channel = a.createDataChannel("relay-contract");
        await until(() => channel.readyState === "open");
        channel.send("before-restart");
        await until(() => received.length === 1);
        a.restartIce();
        await until(
          () =>
            offers >= 2 &&
            a.getState().connectionState === "connected" &&
            a.getState().signalingState === "stable",
        );
        channel.send("after-restart");
        await until(() => received.length === 2);
        const stats = await a.getStats();
        const selected = [...stats.values()].find(
          (item) => item.type === "candidate-pair" && item.state === "succeeded" && item.nominated,
        );
        return {
          received,
          errors,
          candidateType: stats.get(selected.localCandidateId)?.candidateType,
        };
      } finally {
        a.close();
        b.close();
      }
    }, configuration);
    assert.deepEqual(result, {
      received: ["before-restart", "after-restart"],
      errors: [],
      candidateType: "relay",
    });
  }
  execFileSync(process.execPath, [join(root, "tools/test-app.mjs")], {
    cwd: root,
    timeout: 90000,
    stdio: "inherit",
    env: {
      ...process.env,
      PEERWEAVE_TEST_TURN_SECRET_FILE: env.TURN_AUTH_SECRET_FILE,
      PEERWEAVE_TEST_TURN_URL: endpoints.at(-1),
    },
  });
  console.log(
    "TURN deployment passed: startup validation, certificate/hostname verification, non-root TLS health, REST allocation UDP/TCP/TLS, expired/wrong credential denial, private-peer denial, native and Traefik SNI TLS passthrough relay-only bytes and ICE restart.",
  );
} catch (error) {
  if (edgeStarted) console.error(edge("logs", "--no-color", "--tail", "20"));
  if (started) console.error(compose("logs", "--no-color", "--tail", "30"));
  throw error;
} finally {
  await browser?.close();
  await vite?.close();
  if (edgeStarted) edge("down", "--volumes", "--remove-orphans");
  if (edgeNetwork) execFileSync("docker", ["network", "rm", edgeProject], { stdio: "pipe" });
  if (started) compose("down", "--volumes", "--remove-orphans");
  await rm(directory, { recursive: true, force: true });
}

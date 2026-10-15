import { createHmac, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { issueTurnCredentials } from "./turn-credentials.mjs";
export interface ServerOptions {
  port?: number;
  host?: string;
  allowedOrigins?: readonly string[];
  maxClients?: number;
  development?: boolean;
  roomMembers?: Readonly<Record<string, readonly string[]>>;
  turn?: { secret: string; urls: string[] };
  iceTransportPolicy?: "all" | "relay";
  issuanceLimit?: number;
  now?: () => number;
  sessionTtlMs?: number;
}
export async function createSignalingServer(options: ServerOptions = {}) {
  if (options.development && options.host && !["127.0.0.1", "localhost"].includes(options.host))
    throw new Error("Development requires a loopback host");
  const now = options.now ?? Date.now;
  const issuance = new Map<string, { count: number; expires: number }>();
  const permitIssuance = (user: string) => {
    const time = now();
    for (const [key, value] of issuance) if (time >= value.expires) issuance.delete(key);
    const entry = issuance.get(user) ?? { count: 0, expires: time + 60000 };
    if (
      entry.count >= (options.issuanceLimit ?? 10) ||
      (!issuance.has(user) && issuance.size >= 1000)
    )
      return false;
    entry.count++;
    issuance.set(user, entry);
    return true;
  };
  const identity = (request: IncomingMessage) => {
    if (options.development) return "developer";
    const user = request.headers["remote-user"];
    return typeof user === "string" && /^[a-zA-Z0-9_.@-]{1,64}$/.test(user) ? user : null;
  };
  const authorized = (room: string, user: string) => {
    const members =
      options.roomMembers && Object.hasOwn(options.roomMembers, room)
        ? options.roomMembers[room]
        : undefined;
    return /^[-\w]{1,64}$/.test(room) && Array.isArray(members) && members.includes(user);
  };
  const http = createServer((request, response) => {
    if (
      Object.keys(request.headers).some(
        (key) => key.toLowerCase().replaceAll("_", "-") === "remote-user" && key !== "remote-user",
      )
    ) {
      response.writeHead(400);
      response.end();
      return;
    }
    if (
      request.headers.origin &&
      !(options.allowedOrigins
        ? options.allowedOrigins.includes(request.headers.origin)
        : /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.headers.origin))
    ) {
      response.writeHead(403);
      response.end();
      return;
    }
    if (request.url?.startsWith("/api/") && !identity(request)) {
      response.writeHead(401, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://backend");
    if (url.pathname === "/api/ice") {
      if (request.method !== "GET") {
        response.writeHead(405);
        response.end();
        return;
      }
      const user = identity(request) ?? "";
      const room = url.searchParams.get("room") ?? "";
      const status = !authorized(room, user)
        ? 403
        : !permitIssuance(user)
          ? 429
          : options.turn || options.development
            ? 200
            : 503;
      response.writeHead(status, {
        "content-type": "application/json",
        "Cache-Control": "private, no-store",
      });
      if (status === 200 && options.development && !options.turn) {
        response.end(
          JSON.stringify({
            iceServers: [],
            mode: "development",
            expiresAt: Math.floor(now() / 1000) + 3600,
            iceTransportPolicy: "all",
          }),
        );
        return;
      }
      if (status !== 200 || !options.turn) {
        response.end(JSON.stringify({ error: status === 403 ? "FORBIDDEN" : "TURN_UNAVAILABLE" }));
        return;
      }
      const subject = createHmac("sha256", options.turn.secret)
        .update(user)
        .digest("hex")
        .slice(0, 32);
      response.end(
        JSON.stringify({
          ...issueTurnCredentials({ ...options.turn, subject, now: Math.floor(now() / 1000) }),
          mode: "turn",
          iceTransportPolicy: options.iceTransportPolicy ?? "all",
        }),
      );
      return;
    }
    response.writeHead(request.url === "/health" ? 200 : 404, {
      "content-type": "application/json",
    });
    response.end(
      JSON.stringify({
        service: "peerweave-signaling",
        status: request.url === "/health" ? "ok" : "not-found",
      }),
    );
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 65536 });
  const rooms = new Map<string, WebSocket[]>();
  const membership = new Map<WebSocket, { room: string; sessionId: string | null }>();
  const send = (socket: WebSocket, value: unknown) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
  };
  const reject = (socket: WebSocket, code: string) => send(socket, { kind: "error", code });
  const remove = (socket: WebSocket) => {
    const member = membership.get(socket);
    if (!member) return;
    membership.delete(socket);
    const remaining = (rooms.get(member.room) ?? []).filter((s) => s !== socket);
    if (!remaining.length) rooms.delete(member.room);
    else {
      rooms.set(member.room, remaining);
      for (const other of remaining) {
        const record = membership.get(other);
        if (record) record.sessionId = null;
        send(other, { kind: "peer-left" });
      }
    }
  };
  http.on("upgrade", (request, socket, head) => {
    const origin = request.headers.origin;
    const allowed =
      !origin ||
      (options.allowedOrigins
        ? options.allowedOrigins.includes(origin)
        : /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
    if (
      request.url !== "/signaling" ||
      !identity(request) ||
      !allowed ||
      sockets.clients.size >= (options.maxClients ?? 100)
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) =>
      sockets.emit("connection", client, request),
    );
  });
  sockets.on("connection", (socket, request) => {
    const user = identity(request);
    const expiry = setTimeout(
      () => socket.close(1008, "Session expired; rejoin for fresh credentials"),
      options.sessionTtlMs ?? 3000000,
    );
    expiry.unref();
    socket.once("close", () => clearTimeout(expiry));
    socket.on("error", () => remove(socket));
    socket.on("close", () => remove(socket));
    socket.on("message", (data, isBinary) => {
      let message: unknown;
      try {
        if (isBinary) throw new Error("binary");
        message = JSON.parse(data.toString());
      } catch {
        reject(socket, "INVALID_MESSAGE");
        return;
      }
      if (!message || typeof message !== "object" || !("kind" in message)) {
        reject(socket, "INVALID_MESSAGE");
        return;
      }
      if (message.kind === "join") {
        if (
          membership.has(socket) ||
          !("room" in message) ||
          typeof message.room !== "string" ||
          !/^[-\w]{1,64}$/.test(message.room)
        ) {
          reject(socket, "INVALID_ROOM");
          return;
        }
        if (!user || !authorized(message.room, user)) {
          reject(socket, "FORBIDDEN");
          socket.close(1008, "Forbidden");
          return;
        }
        const members = rooms.get(message.room) ?? [];
        if (members.length >= 2) {
          reject(socket, "ROOM_FULL");
          return;
        }
        members.push(socket);
        rooms.set(message.room, members);
        membership.set(socket, { room: message.room, sessionId: null });
        if (members.length === 1) {
          send(socket, { kind: "waiting" });
          return;
        }
        const sessionId = randomUUID();
        for (const [index, member] of members.entries()) {
          const record = membership.get(member);
          if (record) record.sessionId = sessionId;
          send(member, { kind: "ready", sessionId, polite: index === 1 });
        }
      } else if (message.kind === "signal") {
        const member = membership.get(socket);
        if (
          !member?.sessionId ||
          !("sessionId" in message) ||
          message.sessionId !== member.sessionId ||
          !("payload" in message)
        ) {
          reject(socket, "SESSION_MISMATCH");
          return;
        }
        for (const other of rooms.get(member.room) ?? [])
          if (other !== socket)
            send(other, { kind: "signal", sessionId: member.sessionId, payload: message.payload });
      } else reject(socket, "INVALID_MESSAGE");
    });
  });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(options.port ?? 8787, options.host ?? "127.0.0.1", () => {
      http.removeListener("error", reject);
      resolve();
    });
  });
  const address = http.address();
  if (!address || typeof address === "string") throw new Error("No listening address");
  let closing: Promise<void> | undefined;
  return {
    url: `ws://${options.host ?? "127.0.0.1"}:${address.port}/signaling`,
    port: address.port,
    close() {
      closing ??= new Promise<void>((resolve, reject) => {
        for (const socket of sockets.clients) socket.terminate();
        sockets.close();
        http.close((error) => (error ? reject(error) : resolve()));
      });
      return closing;
    },
  };
}

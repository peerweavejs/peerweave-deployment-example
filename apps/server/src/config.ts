import { readFile } from "node:fs/promises";
import type { ServerOptions } from "./server.ts";
import { issueTurnCredentials } from "./turn-credentials.mjs";

const required = (environment: NodeJS.ProcessEnv, name: string) => {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Required configuration: ${name}`);
  return value;
};
export async function loadConfiguration(environment: NodeJS.ProcessEnv): Promise<ServerOptions> {
  const mode = environment.PEERWEAVE_MODE ?? "production";
  if (mode !== "production" && mode !== "development") throw new Error("Invalid PEERWEAVE_MODE");
  if (mode === "development") {
    const host = environment.PEERWEAVE_HOST ?? "127.0.0.1";
    if (host !== "127.0.0.1" && host !== "localhost")
      throw new Error("Development requires a loopback host");
    return {
      host,
      port: Number(environment.PEERWEAVE_PORT ?? 8787),
      development: true,
      roomMembers: {
        hello: ["developer"],
        "support-hello": ["developer"],
        "files-hello": ["developer"],
      },
    };
  }
  const policyPath = required(environment, "ROOM_POLICY_FILE");
  const secretPath = required(environment, "TURN_AUTH_SECRET_FILE");
  const urls = required(environment, "TURN_URLS")
    .split(",")
    .map((value) => value.trim());
  const allowedOrigins = required(environment, "PEERWEAVE_ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim());
  if (
    allowedOrigins.some((value) => {
      const parsed = new URL(value);
      return parsed.protocol !== "https:" || parsed.origin !== value;
    })
  )
    throw new Error("Production origins must be exact HTTPS origins");
  const roomMembers: unknown = JSON.parse(await readFile(policyPath, "utf8"));
  if (
    !roomMembers ||
    typeof roomMembers !== "object" ||
    Array.isArray(roomMembers) ||
    Object.keys(roomMembers).length < 1 ||
    Object.keys(roomMembers).length > 1000 ||
    !Object.entries(roomMembers).every(
      ([room, users]) =>
        /^[-\w]{1,64}$/.test(room) &&
        Array.isArray(users) &&
        users.length > 0 &&
        users.length <= 16 &&
        users.every((user) => typeof user === "string" && /^[a-zA-Z0-9_.@-]{1,64}$/.test(user)),
    )
  )
    throw new Error("Invalid room policy");
  const secret = (await readFile(secretPath, "utf8")).trim();
  issueTurnCredentials({ secret, urls, subject: "configuration-check" });
  const port = Number(environment.PEERWEAVE_PORT ?? 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid PEERWEAVE_PORT");
  const iceTransportPolicy = environment.PEERWEAVE_ICE_POLICY ?? "all";
  if (iceTransportPolicy !== "all" && iceTransportPolicy !== "relay")
    throw new Error("Invalid PEERWEAVE_ICE_POLICY");
  return {
    port,
    host: environment.PEERWEAVE_HOST ?? "0.0.0.0",
    allowedOrigins,
    roomMembers: roomMembers as Record<string, string[]>,
    turn: { secret, urls },
    iceTransportPolicy,
  };
}

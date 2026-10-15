import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { loadConfiguration } from "../src/config.ts";

it("requires explicit production room policy, origin and valid TURN secrets", async () => {
  await expect(loadConfiguration({})).rejects.toThrow("ROOM_POLICY_FILE");
  const directory = await mkdtemp(join(tmpdir(), "peerweave-config-"));
  const policy = join(directory, "rooms.json"),
    secret = join(directory, "secret");
  try {
    await writeFile(policy, JSON.stringify({ hello: ["alice", "bob"] }));
    await writeFile(secret, "a".repeat(64));
    const environment = {
      ROOM_POLICY_FILE: policy,
      TURN_AUTH_SECRET_FILE: secret,
      TURN_URLS: "turn:turn.example.com:3478?transport=udp",
      PEERWEAVE_ALLOWED_ORIGINS: "https://calls.example.com",
    };
    const configured = await loadConfiguration(environment);
    expect(configured.roomMembers).toEqual({ hello: ["alice", "bob"] });
    expect(configured.host).toBe("0.0.0.0");
    for (const override of [
      { TURN_AUTH_SECRET_FILE: "" },
      { TURN_URLS: "" },
      { PEERWEAVE_ALLOWED_ORIGINS: "http://calls.example.com" },
      { PEERWEAVE_PORT: "bad" },
      { PEERWEAVE_ICE_POLICY: "unsafe" },
    ]) {
      await expect(loadConfiguration({ ...environment, ...override })).rejects.toThrow();
    }
    await writeFile(policy, '{"hello":"everyone"}');
    await expect(loadConfiguration(environment)).rejects.toThrow("room policy");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("provides an explicit loopback-only development mode without production credentials", async () => {
  const configured = await loadConfiguration({ PEERWEAVE_MODE: "development" });
  expect(configured.host).toBe("127.0.0.1");
  expect(configured.development).toBe(true);
  expect(configured.roomMembers?.hello).toEqual(["developer"]);
  await expect(
    loadConfiguration({ PEERWEAVE_MODE: "development", PEERWEAVE_HOST: "0.0.0.0" }),
  ).rejects.toThrow("loopback");
  await expect(loadConfiguration({ PEERWEAVE_MODE: "typo" })).rejects.toThrow("PEERWEAVE_MODE");
});

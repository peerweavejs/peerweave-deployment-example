import { expect, it } from "vitest";
import { issueTurnCredentials } from "../apps/server/src/turn-credentials.mjs";

it("issues a bounded, expiring Coturn credential for an authenticated subject", () => {
  const result = issueTurnCredentials({
    secret: "a".repeat(64),
    subject: "user_42",
    urls: ["turn:turn.example.com:3478?transport=udp", "turns:turn.example.com:5349?transport=tcp"],
    now: 1700000000,
    ttlSeconds: 600,
  });
  expect(result.expiresAt).toBe(1700000600);
  expect(result.iceServers).toEqual([
    {
      urls: [
        "turn:turn.example.com:3478?transport=udp",
        "turns:turn.example.com:5349?transport=tcp",
      ],
      username: "1700000600:user_42",
      // Independently derived with OpenSSL HMAC-SHA1, using the literal ASCII hex secret.
      credential: "UMSPpwmdp40g7sDHRu88QaoCS0I=",
    },
  ]);
  expect(JSON.stringify(result)).not.toContain("a".repeat(64));
});

it("rejects unsafe issuer inputs before creating credentials", () => {
  const valid = {
    secret: "a".repeat(64),
    subject: "user_42",
    urls: ["turn:turn.example.com:3478?transport=udp"],
    now: 1700000000,
  };
  for (const override of [
    { secret: "short" },
    { subject: "user@example.com" },
    { subject: "a:b" },
    { ttlSeconds: 0 },
    { ttlSeconds: 86401 },
    { now: -1 },
    { now: Number.NaN },
    { urls: [] },
    { urls: ["https://turn.example.com"] },
    { urls: ["turns:turn.example.com:5349?transport=udp"] },
    { urls: ["turn:turn.example.com:65536?transport=tcp"] },
    { urls: ["turn:user:password@turn.example.com:3478?transport=tcp"] },
  ]) {
    expect(() => issueTurnCredentials({ ...valid, ...override })).toThrow();
  }
});

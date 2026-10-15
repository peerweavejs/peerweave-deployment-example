/**
 * Call only after authenticating the user and authorizing their call/room membership.
 * @param {{ secret: string, subject: string, urls: string[], now?: number, ttlSeconds?: number }} options
 */
export function issueTurnCredentials(options) {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const ttl = options.ttlSeconds ?? 3600;
  if (
    !/^[a-f0-9]{64}$/i.test(options.secret) ||
    !/^[a-z0-9_-]{1,64}$/i.test(options.subject) ||
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !Number.isSafeInteger(ttl) ||
    ttl < 60 ||
    ttl > 86400 ||
    !Array.isArray(options.urls) ||
    options.urls.length < 1 ||
    options.urls.length > 8 ||
    !options.urls.every((url) => {
      const match =
        /^(turns?):([a-z0-9.-]+|\[[a-f0-9:]+\]):([0-9]{1,5})\?transport=(udp|tcp)$/i.exec(url);
      return (
        match &&
        Number(match[3]) > 0 &&
        Number(match[3]) <= 65535 &&
        (match[1].toLowerCase() !== "turns" || match[4].toLowerCase() === "tcp")
      );
    })
  )
    throw new TypeError("Invalid TURN issuer configuration");
  const expiresAt = now + ttl;
  const username = `${expiresAt}:${options.subject}`;
  return {
    iceServers: [
      {
        urls: [...options.urls],
        username,
        credential: createHmac("sha1", options.secret).update(username).digest("base64"),
      },
    ],
    expiresAt,
  };
}

import { createHmac } from "node:crypto";

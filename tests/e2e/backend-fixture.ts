import { createSignalingServer as createBackend } from "../../apps/server/src/server.ts";

// Explicit test-only memberships exercise the same ICE and signaling authorization boundary.
export async function createSignalingServer({ port = 0 } = {}) {
  const rooms = [
    "hello",
    "e2e",
    "denied",
    "delayed-start",
    "files-file-test",
    "files-premature-receipt",
    "files-cancel-file",
    "support-support-test",
    "support-simultaneous-support",
    "support-decline-call",
  ];
  const backend = await createBackend({
    port,
    development: true,
    roomMembers: Object.fromEntries(rooms.map((room) => [room, ["developer"]])),
  });
  return { ...backend, url: `ws://127.0.0.1:${backend.port}/signaling` };
}

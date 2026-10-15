function parseLease(
  input: unknown,
  now: number,
): { expiresAt: number; configuration: RTCConfiguration } {
  const value = input as Record<string, unknown> | null;
  if (
    !value ||
    typeof value !== "object" ||
    !Number.isSafeInteger(value.expiresAt) ||
    (value.expiresAt as number) <= Math.floor(now / 1000) + 60 ||
    (value.expiresAt as number) > Math.floor(now / 1000) + 86400 ||
    !["all", "relay"].includes(value.iceTransportPolicy as string) ||
    !["turn", "development"].includes(value.mode as string) ||
    !Array.isArray(value.iceServers) ||
    value.iceServers.length > 8 ||
    (value.mode !== "development" && value.iceServers.length === 0) ||
    !value.iceServers.every((server: unknown) => {
      if (!server || typeof server !== "object") return false;
      const item = server as Record<string, unknown>;
      return (
        Array.isArray(item.urls) &&
        item.urls.length > 0 &&
        item.urls.length <= 8 &&
        item.urls.every(
          (url: unknown) =>
            typeof url === "string" &&
            url.length < 512 &&
            /^turns?:[a-z0-9.[\]:-]+\?transport=(udp|tcp)$/i.test(url),
        ) &&
        typeof item.username === "string" &&
        item.username.length > 0 &&
        item.username.length <= 128 &&
        typeof item.credential === "string" &&
        item.credential.length > 0 &&
        item.credential.length <= 256
      );
    })
  )
    throw new Error("Invalid ICE lease");
  return {
    expiresAt: value.expiresAt as number,
    configuration: {
      iceServers: value.iceServers as RTCIceServer[],
      iceTransportPolicy: value.iceTransportPolicy as RTCIceTransportPolicy,
    },
  };
}

export class IceSession {
  private pending: AbortController | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly endpoint = "/api/ice",
    private readonly now = Date.now,
  ) {}
  async prepare(room: string, onExpire: () => void): Promise<RTCConfiguration | null> {
    this.cancel();
    const pending = new AbortController();
    this.pending = pending;
    try {
      const response = await fetch(`${this.endpoint}?room=${encodeURIComponent(room)}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: AbortSignal.any([pending.signal, AbortSignal.timeout(8000)]),
      });
      if (!response.ok)
        throw new Error(
          `Room setup failed (${response.status}). Check authentication and membership.`,
        );
      const lease = parseLease(await response.json(), this.now());
      if (pending.signal.aborted) return null;
      this.expiry = setTimeout(
        () => {
          this.cancel();
          onExpire();
        },
        Math.min(3000000, lease.expiresAt * 1000 - this.now() - 60000),
      );
      return lease.configuration;
    } catch (error) {
      if (pending.signal.aborted) return null;
      throw error;
    }
  }
  cancel() {
    this.pending?.abort();
    this.pending = undefined;
    clearTimeout(this.expiry);
    this.expiry = undefined;
  }
}

# Security

Production has one trusted HTTP edge. Traefik authenticates requests, clears spoofed identity,
sets verified `Remote-User`, strips Authorization and proxies to an unpublished backend port.
Do not share the app network with untrusted workloads. Identity headers are not authentication
when accepted directly from the Internet. BasicAuth is the private baseline; OIDC is a later adapter.

The backend requires explicit operator-managed room membership for both TURN issuance and
signaling joins. It rejects missing identity, unexpected Origin, malformed rooms and excessive
requests. A room name alone is not permission. Limits/rooms are in memory and reset on restart.
Policy changes take effect through deliberate process restart/drain.

TURN shared secrets and TLS keys are file-mounted, never browser config or image content.
Clients receive only bounded short-lived credentials. Do not log credentials, SDP/candidates,
Authorization or unredacted policy. Protect backups, ACME state and Docker access. See the
[deployment guide](webrtc-production.md) for host permissions, peer restrictions and updates.

Local development is loopback-only and explicit. Tests use temporary fixtures, not production
secrets. Check [quality](QUALITY_SCORE.md) for verified boundaries and remaining external work.

# Reliability

The backend is a single process with bounded two-member rooms. Restarting it ends signaling
sessions; clients leave/rejoin rather than assuming resumable calls. An established WebSocket
does not prove a media path. Observe ICE state and selected candidates through native stats.

Direct WebRTC is preferred. TURN supports UDP/TCP/TLS with finite allocation/port/bandwidth
budgets. Shared-IP TLS 443 uses optional SNI passthrough; corporate proxies may still block it.
Coturn restarts interrupt allocations. Certificate/secret changes need a drain/restart strategy.

New peers fetch fresh ICE leases. Current framework APIs configure ICE at creation; this app
bounds room-session duration instead of promising indefinite credential refresh. Leave/unmount
cancels pending setup and releases owned browser resources. External failure-mode checks are
listed in [deployment](webrtc-production.md) and measured in [quality](QUALITY_SCORE.md).

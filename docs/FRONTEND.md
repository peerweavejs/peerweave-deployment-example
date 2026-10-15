# Frontend

Gyral 0.3.6 owns pure views/models. Controllers/drivers own signaling, capture, streams, native
channels and object URLs. Use installed Peerweave package exports, semantic native controls,
accessible feedback and the existing layered CSS. Retain font license files.

Obtain room-authorized ICE configuration before creating a peer. A failed fetch must surface
an error and must not open signaling with fallback credentials. Dispose pending work when the
participant leaves. New joins obtain a new lease; active sessions have an explicit expiry bound.

The source examples stay in the framework repo; this application's copy evolves independently.
See [scope](product-specs/index.md) and [architecture](../ARCHITECTURE.md).

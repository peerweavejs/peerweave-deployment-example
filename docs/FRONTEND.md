# Frontend

Gyral 0.3.8 owns pure views/models. Controllers/drivers own signaling, capture, streams, native
channels and object URLs. Use installed Peerweave package exports, semantic native controls,
accessible feedback and the existing layered CSS. Retain font license files.

A component renders only when its state or a declared prop (`initialRoom`) changes, so a view
reads nothing else. A new stream reaches the view as the snapshot's `revision`, which re-runs the
media hooks. Each entry gives its element the driver list from `bindRuntime`, whose state feed
implements the component's `example-events` token, so both must agree on the state type.

Obtain room-authorized ICE configuration before creating a peer. A failed fetch must surface
an error and must not open signaling with fallback credentials. Dispose pending work when the
participant leaves. New joins obtain a new lease; active sessions have an explicit expiry bound.

This repo owns the four richer examples and their regressions. The framework has one separate,
minimal vanilla TypeScript video page; there is no shared UI copy or sibling source dependency.
See [scope](product-specs/index.md) and [architecture](../ARCHITECTURE.md).

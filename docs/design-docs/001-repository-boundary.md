# Application and framework boundary

Status: accepted, 2026-10-15.

Peerweave owns library APIs, protocol/native contracts and lightweight development examples.
This repository owns the deployed application, authentication and room policy, TURN credential
issuance, image builds, edge/relay configuration, operations and application verification.

The initial web UI is a copy of the reference examples with its MIT notices/fonts retained.
It can evolve independently. Only packed public package exports cross the boundary. Since
Peerweave packages are private, checked-in tarballs and a checksum/source manifest provide a
self-contained bootstrap. Updating them is explicit; no automatic sibling source imports.

Cost: application copies can diverge and artifact updates require review. Benefit: app releases,
security maintenance and operations no longer define the framework's development environment.
A third infrastructure repo is unnecessary while there is one deployment example.

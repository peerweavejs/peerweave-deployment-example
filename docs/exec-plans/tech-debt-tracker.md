# Technical debt and follow-ups

| Item | Current boundary | Next evidence needed |
| --- | --- | --- |
| Public package distribution | Private 0.1.0 tarballs with checksums | Framework release authorization/API review |
| Identity lifecycle | Private operator-managed deployment | OIDC/ForwardAuth integration, revocation tests |
| Horizontal scaling | One backend, in-memory rooms/rate limits | Shared routing/membership design before replicas |
| Public reachability | Local native/browser/container tests | DNS, ACME, NAT, real mobile and restrictive-network checks |
| Long sessions | Bounded credential/call lifetime | Tested hot ICE credential refresh before longer sessions |

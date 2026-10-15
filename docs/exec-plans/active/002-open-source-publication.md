# Publish the independent deployment example

Status: in progress, 2026-10-15. User authorized commits and public GitHub publication under peerweavejs.

- [x] Prepare complete README, badges, contribution/security/community guidance and templates.
- [x] Use canonical org links and metadata; retain private application access and unpublished packages.
- [x] Replace the copied external article with an attributed reference summary.
- [x] Refresh archives/provenance from the reviewed, committed framework.
- [x] Run the app/deployment gates, inspect the commit contents and commit the new repo.
- [ ] Create peerweavejs/peerweave-deployment-example, push and configure About topics/settings.
- [ ] Verify published branches, license, community files and remote CI status.

No npm publication, production deployment or account credentials are in scope. The framework's
existing public repo is being transferred/renamed with history; this application gets its first repo.

Local preparation: refreshed all four archives from framework commit
`d3ac8713c2ff3a1c5851ee5f8b0f79d8535f8d42`, with canonical organization source metadata and
new SHA-256 hashes. Frozen install, `pnpm check` (42 cases plus native app), and both image
builds passed. Workflow actions are pinned to verified SHAs. MIT/font notices remain intact;
the external article is now an attributed linked summary. Community template metadata parses.

Refreshed-artifact verification passed: `pnpm check`, both image builds, actual authenticated
Traefik HTTPS/ICE/WSS and Coturn UDP/TCP/TLS/SNI relay tests. The built app used API-fetched
credentials and selected relay candidates for native media/chat/file exchange. Temporary resources
were removed. The 121 staged files and all four archive contents were reviewed; private runtime
files and generated/editor output are excluded.

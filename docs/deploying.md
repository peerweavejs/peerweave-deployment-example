# Deploy behind an existing Traefik instance

For a complete deployment using the supplied **standalone Traefik and Coturn projects**, follow
[Run Peerweave with Traefik and Coturn](webrtc-production.md). It covers ordered bootstrap,
authentication, certificates, the shared-IP 443 option, credential issuance, WebRTC data flow,
firewalls and production operation. This page covers the app images and an existing edge proxy.

The root [Dockerfile](../Dockerfile) builds two runtime images: an unprivileged Nginx server
for the compiled four-page example and a Node server for the signaling relay. The
[Compose file](../compose.yaml) references images only. It runs neither Vite nor a source watcher.
Traefik terminates TLS and forwards HTTP to port 8080 for the site and the ICE API and WebSocket upgrades on
`/api/ice` and `/signaling` to port 8787 for the relay. Browsers automatically use same-origin WSS on HTTPS pages.
The routers use Traefik's standard [WebSocket and TLS termination support](https://doc.traefik.io/traefik/v3.4/user-guides/websocket/).

## Configure

This setup assumes Traefik runs on the same Docker host, has its Docker provider enabled, and
joins an existing external Docker network. It does not start or modify Traefik.

```sh
cp .env.example .env
```

Edit `.env` before starting the services:

| Setting | Meaning |
| --- | --- |
| `PEERWEAVE_DOMAIN` | Public DNS hostname, such as `calls.example.com`; no scheme, port or path |
| `PEERWEAVE_IMAGE_PREFIX` | Image prefix; defaults to `peerweave` |
| `PEERWEAVE_IMAGE_TAG` | Image version; defaults to `local` |
| `TRAEFIK_NETWORK` | Existing Docker network shared with Traefik; defaults to `traefik` |
| `TRAEFIK_ENTRYPOINT` | Existing HTTPS entrypoint; defaults to `websecure` |
| `TRAEFIK_CERT_RESOLVER` | Existing certificate resolver name, or blank to use entrypoint/default-store TLS configuration |
| `ROOM_POLICY_FILE` | Private explicit room membership JSON; backend UID 1000 |
| `TURN_AUTH_SECRET_FILE` | Backend private copy of the Coturn secret; UID 1000 |
| `TURN_URLS` | Comma-separated public TURN endpoints |
| `PEERWEAVE_ICE_POLICY` | `all` normally; `relay` for relay-only acceptance |
| `TRAEFIK_MIDDLEWARES` | Optional comma-separated existing middleware references, such as `private-access@file`; applies to both routers |

Point the hostname's DNS at Traefik and configure its certificate and HTTP-to-HTTPS redirection
in the existing Traefik deployment. If its shared network does not yet exist, create it and
attach Traefik to it; the network name must match `.env`:

```sh
docker network create traefik
```

Neither Peerweave service publishes a host port. Both use non-root users, read-only root
filesystems, health checks and restart policies. Compose derives the relay's exact allowed page
origin as `https://PEERWEAVE_DOMAIN`; it preserves the browser's Origin header through Traefik.
Local Vite `allowedHosts` settings do not apply to the compiled site.

## Build and start on the server

Docker with the Compose plugin is sufficient; Node and pnpm are only needed inside the image build.
From the repository root:

```sh
./tools/build-images.sh
docker compose config --quiet
docker compose up -d --wait
docker compose ps
```

The shell script builds `peerweave-example-web:local` and `peerweave-example-signaling:local`. It uses the
pnpm version pinned in `package.json`, installs the frozen lockfile, and includes only built
static assets or compiled relay code with production dependencies in the runtime images.
Base images are pinned by digest in the Dockerfile; update those pins when taking base-image fixes.

Open `https://your-hostname/` in two browsers and join the same room. The other examples are
`/media/`, `/transfer/` and `/support/`. In developer tools, `/signaling` should upgrade with
HTTP 101. A 403 from the relay can mean the page origin differs from the configured hostname.

The deployment's two Traefik routers are named `peerweave-web` and `peerweave-signaling`.
Configure one instance per Traefik provider, or rename the routers and services for additional
independent deployments. Keep one signaling container: rooms are held in that process's memory.

## Build elsewhere and transfer images

Use a registry prefix and a version tag on the build machine:

```sh
./tools/build-images.sh registry.example.com/team/peerweave v1
docker push registry.example.com/team/peerweave-web:v1
docker push registry.example.com/team/peerweave-signaling:v1
```

Set the matching `PEERWEAVE_IMAGE_PREFIX=registry.example.com/team/peerweave` and
`PEERWEAVE_IMAGE_TAG=v1` in the server's `.env`, then copy `compose.yaml` and the edited `.env`
to that server and run:

```sh
docker compose pull
docker compose up -d --wait
```

The build script accepts `[image-prefix [tag]]`, or the corresponding exported shell variables.
It does not source `.env`; that file is read by Compose. It builds for the build machine's
architecture. Build on a matching host, or build each Dockerfile target with Docker Buildx for
the target platform. As an alternative to a registry, `docker save`/`docker load` can transfer
both image tags. No source checkout or Dockerfile is needed to run the images on the server.

## Updates, operation and current limits

Build a new image tag, transfer it, change the server's `.env` tag, and run
`docker compose up -d --wait`. Keep the previous tag for rollback. Recreating the signaling container ends active
sessions; participants must rejoin. Inspect logs with `docker compose logs --tail=100 -f` and
stop the application with `docker compose down`. The external Traefik network is retained.

The app's backend trusts identity from the authenticated proxy and enforces explicit room
membership for both signaling and ICE credentials. Production requires private room-policy and
TURN-secret files readable by UID 1000, plus valid public TURN URLs. Follow the
[complete bootstrap guide](webrtc-production.md#4-configure-membership-then-start-coturn-and-the-application)
before starting this Compose project; applying authentication only to the web router is insufficient.

Traefik carries static assets, the authorized ICE API and signaling. Media and file bytes use
WebRTC directly or Coturn. Controllers fetch a new ICE lease on each join, cancel pending setup
on leave and bound session lifetime. Rooms/limits remain in memory; one backend instance is
supported. Native Safari/mobile and restrictive-network checks remain external acceptance work.

## Verify the images

On a Linux Docker host with the workspace dependencies and Playwright Chromium installed:

```sh
./tools/build-images.sh
pnpm test:deployment
```

The test creates a temporary external network and the supplied standalone Traefik project, loads
the actual Compose labels, verifies authentication and Docker API restrictions, and checks
healthy non-root containers and all four compiled HTTPS pages,
rejects an unlisted signaling Origin, and exchanges native video and chat over WSS-established
sessions. It uses a self-signed certificate only in the test browser and removes its containers
and network afterward. A restricted socket proxy holds the Docker socket; Traefik does not
mount it directly. The test detects the local Unix socket from
`DOCKER_HOST` or the active Docker context, including rootless Docker. Set exported image
prefix/tag variables to test non-default image tags.

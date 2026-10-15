# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:stable-alpine@sha256:782bb89768cc87b7f95c18b95baa1af250e5d451f26794f59363540161147c01

FROM ${NODE_IMAGE} AS build
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY vendor ./vendor
RUN npm install --global "$(node --print 'require("./package.json").packageManager')"
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile \
    && pnpm build \
    && pnpm --filter @peerweave-example/server deploy --prod --legacy /out/signaling

FROM ${NODE_IMAGE} AS signaling
ENV NODE_ENV=production PEERWEAVE_HOST=0.0.0.0 PEERWEAVE_PORT=8787
WORKDIR /app
COPY --from=build /out/signaling/node_modules ./node_modules
COPY --from=build /workspace/apps/server/package.json ./package.json
COPY --from=build /workspace/apps/server/dist ./dist
USER node
EXPOSE 8787
CMD ["node", "dist/main.js"]

FROM ${NGINX_IMAGE} AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 8080

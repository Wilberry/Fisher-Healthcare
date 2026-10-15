# Foundation preview only. This image has no healthcare production approval.
FROM node:22-bookworm-slim AS build
WORKDIR /workspace
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY . .
RUN corepack pnpm install --no-frozen-lockfile
RUN corepack pnpm build

FROM node:22-bookworm-slim AS preview
WORKDIR /workspace
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /workspace ./
USER node
EXPOSE 4000
CMD ["node","apps/api/dist/main.js"]

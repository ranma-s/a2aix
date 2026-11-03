FROM node:22-bookworm-slim

WORKDIR /ix

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY scripts ./scripts
COPY policy ./policy
COPY tsconfig.json ./

RUN pnpm install --frozen-lockfile

USER node

ENV IX_BIND=127.0.0.1
ENV IX_PORT=8787
ENV IX_MODE=open
ENV IX_NOW=2026-11-04T00:00:00.000Z

CMD ["node", "--import", "tsx", "scripts/local-ix.mjs", "serve"]

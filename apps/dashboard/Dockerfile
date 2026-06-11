FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/dashboard/package.json apps/dashboard/
RUN pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules
COPY apps/dashboard/ ./apps/dashboard/
COPY pnpm-workspace.yaml package.json ./
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm --filter @pharma/dashboard build

FROM nginx:alpine AS runtime
COPY --from=build /app/apps/dashboard/dist /usr/share/nginx/html
COPY --from=build /app/apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

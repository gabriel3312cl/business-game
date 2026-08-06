FROM node:22-alpine AS base

WORKDIR /app

RUN corepack enable

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS development

COPY frontend/ ./

EXPOSE 8080

CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "8080"]

FROM base AS build

COPY frontend/ ./
RUN pnpm build

FROM nginx:1.27-alpine AS production

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

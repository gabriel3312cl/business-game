FROM node:22-alpine AS base

WORKDIR /app

RUN corepack enable && chown node:node /app

USER node

COPY --chown=node:node frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS development

COPY --chown=node:node frontend/ ./

EXPOSE 8080

CMD ["pnpm", "dev", "--host", "0.0.0.0", "--port", "8080"]

FROM base AS build

COPY --chown=node:node frontend/ ./
RUN pnpm build

FROM nginx:1.27-alpine AS production

RUN chown -R nginx:nginx /etc/nginx/conf.d /var/cache/nginx /run

COPY --chown=nginx:nginx frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=nginx:nginx --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

USER nginx

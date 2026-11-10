# syntax=docker/dockerfile:1

# ---- Build stage -----------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

# Dev dependencies are required to build the Vite client and the server bundle
ENV NODE_ENV=development

COPY package.json package-lock.json ./
RUN apk upgrade --no-cache \
 && npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---- Runtime stage ---------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=5000

# Patch OS packages in this image before dropping privileges
RUN apk upgrade --no-cache

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force

# Built client (dist/public) and bundled Express server (dist/index.cjs)
COPY --from=build /app/dist ./dist

RUN addgroup -S -g 10001 appuser \
 && adduser -S -u 10001 -G appuser appuser \
 && chown -R appuser:appuser /app
USER appuser

EXPOSE 5000

CMD ["node", "dist/index.cjs"]

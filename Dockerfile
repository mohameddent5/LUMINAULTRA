# syntax=docker/dockerfile:1

# ---- Build stage -----------------------------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app

# Dev dependencies are required to build the Vite client and the server bundle
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---- Runtime stage ---------------------------------------------------------
FROM node:24-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Apply current distributor security fixes for the OS packages in this image
RUN apt-get update \
 && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force

# Built client (dist/public) and bundled Express server (dist/index.cjs)
COPY --from=build /app/dist ./dist

RUN useradd --create-home --uid 10001 appuser \
 && chown -R appuser:appuser /app
USER appuser

EXPOSE 5000

CMD ["node", "dist/index.cjs"]

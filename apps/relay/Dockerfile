FROM oven/bun:1.3-slim AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

COPY . .
RUN bun run build


FROM oven/bun:1.3-slim
WORKDIR /app

COPY --from=build /app/dist ./dist

USER bun
EXPOSE 3000

ENTRYPOINT ["bun", "dist/index.js"]

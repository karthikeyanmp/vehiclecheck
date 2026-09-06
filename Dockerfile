# Multi-stage build: install + build the client, then a slim runtime image
# that runs the Express server (which also serves the built client).

# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY server/package*.json server/
COPY client/package*.json client/
RUN npm --prefix server ci && npm --prefix client ci
COPY . .
RUN npm --prefix client run build

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
# server code assumes its own directory is the working dir (font/asset/upload
# paths are relative to it) and looks for the client build at ../client/dist
WORKDIR /app/server
COPY --from=build /app/server ./
COPY --from=build /app/client/dist /app/client/dist
EXPOSE 4000
# run migrations, then start
CMD ["sh", "-c", "node scripts/migrate.js && node src/index.js"]

# --- Etape 1 : dependances de production uniquement ---
FROM node:24-alpine AS deps
WORKDIR /build
COPY package*.json ./
RUN npm ci --omit=dev

# --- Etape 2 : image finale ---
FROM node:24-alpine

# Correctifs de securite de l'image de base + init minimal (gestion propre des signaux)
RUN apk upgrade --no-cache \
    && apk add --no-cache dumb-init \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production
WORKDIR /usr/src/app

# L'utilisateur "node" (uid 1000) existe deja dans l'image officielle
COPY --from=deps --chown=node:node /build/node_modules ./node_modules
COPY --chown=node:node server.js ./server.js
COPY --chown=node:node app.js ./app.js
COPY --chown=node:node src ./src

USER node
EXPOSE 5000

CMD ["dumb-init", "node", "server.js"]

LABEL org.opencontainers.image.source="https://github.com/TsiryNajoro/fixbook-back"

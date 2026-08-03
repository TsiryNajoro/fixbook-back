FROM node:20-alpine

WORKDIR /app

# Install dependencies first so this layer is cached unless package.json changes
COPY package*.json ./
RUN npm ci --omit=dev

# Then copy the rest of the source
COPY . .

EXPOSE 5000

CMD ["node", "server.js"]

LABEL org.opencontainers.image.source="https://github.com/TsiryNajoro/fixbook-back"
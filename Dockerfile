ARG NODE_VERSION=24.21.0
ARG ALPINE_VERSION=3.24

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS builder

WORKDIR /build-stage

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .


FROM alpine:${ALPINE_VERSION}

WORKDIR /usr/src/app

RUN apk update \
    && apk upgrade \
    && apk add --no-cache \
        libstdc++ \
        dumb-init \
    && addgroup -g 1000 node \
    && adduser -u 1000 -G node -s /bin/sh -D node \
    && chown node:node /usr/src/app

COPY --from=builder /usr/local/bin/node /usr/local/bin/
COPY --from=builder /usr/local/bin/docker-entrypoint.sh /usr/local/bin/

ENTRYPOINT ["docker-entrypoint.sh"]

USER node

COPY --from=builder /build-stage/node_modules ./node_modules
COPY --from=builder /build-stage/server.js ./server.js
COPY --from=builder /build-stage/src ./src

EXPOSE 5000

CMD ["dumb-init", "node", "server.js"]

LABEL org.opencontainers.image.source="https://github.com/TsiryNajoro/fixbook-back"
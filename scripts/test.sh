#!/bin/sh
# Tests dans un conteneur Node. Modes : unit, integration (npm test + MongoDB), all.
# Les valeurs d'environnement sensibles sont factices ; aucun fichier .env n'est lu.
# Le conteneur Node utilise l'UID/GID du lanceur pour que les fichiers generes
# (notamment coverage/) restent supprimables par Jenkins au build suivant.

set -u
. "$(dirname "$0")/lib.sh"

MODE=${1:-all}
case "$MODE" in
    unit|integration|all) ;;
    *) fail "usage : $0 [unit|integration|all]" ;;
esac
require_env NODE_IMAGE WORKSPACE

NETWORK_ARGS=''
MONGO_ENV_ARGS=''
if [ "$MODE" != unit ]; then
    require_env MONGO_IMAGE
    SUFFIX=$(printf '%s' "${BUILD_TAG:-local}" | tr -c 'a-zA-Z0-9_.-' '-')
    NET="ci-net-${SUFFIX}"
    DB="ci-mongo-${SUFFIX}"

    cleanup() {
        docker rm -f "$DB" >/dev/null 2>&1 || true
        docker network rm "$NET" >/dev/null 2>&1 || true
    }
    trap cleanup EXIT
    cleanup

    docker network create "$NET" >/dev/null || fail "creation du reseau de test impossible"
    docker run -d --name "$DB" --network "$NET" "$MONGO_IMAGE" >/dev/null || fail "demarrage de MongoDB impossible"

    # Attente que MongoDB reponde (60 s maximum)
    tries=0
    until docker exec "$DB" mongosh --quiet --eval 'db.runCommand({ping:1})' >/dev/null 2>&1; do
        tries=$((tries + 1))
        [ "$tries" -lt 30 ] || fail "MongoDB ne repond pas apres 60 s"
        sleep 2
    done
    echo "MongoDB de test pret."

    NETWORK_ARGS="--network $NET"
    MONGO_ENV_ARGS="-e MONGO_URI=mongodb://${DB}:27017/fixbook_test"
    TEST_COMMAND='npm test'
else
    TEST_COMMAND='npm run test:unit'
fi

# node_modules est supprime a la fin : il ne doit pas etre analyse par Gitleaks/SonarQube.
docker run --rm \
    --user "$(id -u):$(id -g)" \
    $NETWORK_ARGS \
    -e CI=true \
    -e NODE_ENV=test \
    -e PORT=5000 \
    -e CLIENT_URL=http://localhost:5173 \
    $MONGO_ENV_ARGS \
    -e JWT_SECRET=ci-test-jwt-secret \
    -e SESSION_SECRET=ci-test-session-secret \
    -e JWT_EXPIRES_IN=1h \
    -e GOOGLE_CLIENT_ID=ci-test \
    -e GOOGLE_CLIENT_SECRET=ci-test \
    -e GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback \
    -e MICROSOFT_CLIENT_ID=ci-test \
    -e MICROSOFT_CLIENT_SECRET=ci-test \
    -e MICROSOFT_CALLBACK_URL=http://localhost:5000/api/auth/microsoft/callback \
    -e MICROSOFT_TENANT=common \
    -e HOME=/tmp \
    -v jenkins_home:/var/jenkins_home \
    -w "$WORKSPACE" \
    "$NODE_IMAGE" \
    sh -c '
        trap "rm -rf node_modules" EXIT
        npm ci
        if [ "$1" = "npm test" ]; then
            npm test
        else
            npm run test:unit
        fi
    ' sh "$TEST_COMMAND"

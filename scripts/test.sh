#!/bin/sh
# Tests du back dans un conteneur Node, avec une base MongoDB JETABLE :
#   - un reseau Docker et un conteneur MongoDB sont crees pour ce build, puis supprimes (meme en cas d'echec) ;
#   - la configuration de test est fournie par des variables d'environnement avec des valeurs FACTICES :
#     aucun vrai secret dans la CI, aucun .env ;
#   - aucune dependance installee sur Jenkins.
# Si le projet n'a pas de script "test", le stage l'indique clairement et passe.
#
# Entrees : NODE_IMAGE, MONGO_IMAGE, WORKSPACE, BUILD_TAG (facultatif, rend les noms uniques)
# Code de retour : 0 si les tests passent (ou n'existent pas), 1 sinon.

set -u
. "$(dirname "$0")/lib.sh"

require_env NODE_IMAGE MONGO_IMAGE WORKSPACE

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

# node_modules est supprime a la fin : il ne doit pas etre analyse par Gitleaks/SonarQube.
docker run --rm \
    --network "$NET" \
    -e CI=true \
    -e NODE_ENV=test \
    -e PORT=5000 \
    -e CLIENT_URL=http://localhost:5173 \
    -e MONGO_URI="mongodb://${DB}:27017/fixbook_test" \
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
    -v jenkins_home:/var/jenkins_home \
    -w "$WORKSPACE" \
    "$NODE_IMAGE" \
    sh -c '
        trap "rm -rf node_modules" EXIT
        if ! node -e "const s=(require(\"./package.json\").scripts||{}).test; process.exit(s && !/no test specified/.test(s) ? 0 : 1)"; then
            echo "AUCUN TEST DEFINI : ajouter un script \"test\" dans package.json."
            exit 0
        fi
        npm ci
        npm test
    '

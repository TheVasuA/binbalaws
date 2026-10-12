#!/usr/bin/env bash
# Build, push and roll out binbalaws on the local MicroK8s cluster.
set -euo pipefail

cd "$(dirname "$0")/.."

KUBECTL="microk8s kubectl"
REGISTRY=localhost:32000
# Unique per deploy so the pod always rolls and picks up .env changes.
TAG=$(git rev-parse --short HEAD)-$(date +%Y%m%d%H%M%S)
IMAGE=$REGISTRY/binbalaws:$TAG

$KUBECTL apply -f k8s/namespace.yaml

if ! $KUBECTL -n binbalaws get secret basic-auth >/dev/null 2>&1; then
  echo "Missing secret binbalaws/basic-auth. Create it with:" >&2
  echo "  $KUBECTL -n binbalaws create secret generic basic-auth --from-literal=users=\"<user>:\$(openssl passwd -apr1 <password>)\"" >&2
  exit 1
fi

echo ">>> Building $IMAGE"
docker build -t "$IMAGE" .
docker push "$IMAGE"

echo ">>> Applying manifests"
# App config/secrets live in .env (not in git); sync it into the cluster.
$KUBECTL -n binbalaws create secret generic binbalaws-env \
  --from-env-file=.env --dry-run=client -o yaml | $KUBECTL apply -f -

$KUBECTL kustomize k8s \
  | sed "s#$REGISTRY/binbalaws:latest#$IMAGE#g" \
  | $KUBECTL apply -f -

$KUBECTL -n binbalaws rollout status deploy/bala-app --timeout=300s

docker image prune -f >/dev/null
echo ">>> Deployed $IMAGE"
$KUBECTL -n binbalaws get pods

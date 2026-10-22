#!/usr/bin/env bash
# Deploy the MOCK-ONLY build to the SE cluster. The first deploy of each app is OWNER-APPROVED: this script refuses to
# run unless OWNER_APPROVED=1 is set by the owner. It never builds or pushes an image; it applies manifests for an image
# that already exists in the registry.
#
#   OWNER_APPROVED=1 IMAGE=<registry>/<repo>/worker-demo:<sha> SE_HOST=<host> k8s/deploy.sh [--dry-run]
#
# After the deploy (not done by this script): verify by CONTENT, not 200 (GET /api/info must say {mode:mock, simulated:true, hosted:true, workspaceId:per-session}),
# check the registry manifest and the pod's imageID match IMAGE, and hand over the full https:// URL after browser proof.
set -euo pipefail
cd "$(dirname "$0")"

[ "${OWNER_APPROVED:-}" = "1" ] || { echo "refusing: the first SE deploy of each app is owner-approved (set OWNER_APPROVED=1)" >&2; exit 2; }
: "${IMAGE:?set IMAGE to the registry image with an explicit tag}" "${SE_HOST:?set SE_HOST to the SE cluster host}"
case "$IMAGE" in
  *:latest|*:HEAD|*:|*[!A-Za-z0-9._:/@-]*|"") echo "refusing: IMAGE must carry an explicit immutable tag or digest, not latest/HEAD" >&2; exit 2;;
  *:*) ;;
  *) echo "refusing: IMAGE has no tag" >&2; exit 2;;
esac
case "$SE_HOST" in *[!a-z0-9.-]*|"") echo "refusing: SE_HOST must be a plain host name" >&2; exit 2;; esac

render() { IMAGE="$IMAGE" SE_HOST="$SE_HOST" envsubst '${IMAGE} ${SE_HOST}' < "$1"; echo '---'; }
if [ "${1:-}" = "--dry-run" ]; then render deployment.yaml; render service.yaml; render ingress.yaml; exit 0; fi
for f in deployment.yaml service.yaml ingress.yaml; do render "$f" | kubectl apply -f -; done
kubectl rollout status deployment/worker-demo --timeout=120s

#!/usr/bin/env bash
# temporal-diagnostics.sh
# Run a series of kubectl/network checks and append all output to a logfile
# Usage: LOGFILE=./out.log bash tools/temporal-diagnostics.sh

LOGFILE=${LOGFILE:-"./temporal-diagnostics-$(date +%Y%m%dT%H%M%S).log"}
exec > >(tee -a "$LOGFILE") 2>&1

echo "==================== Temporal diagnostics ===================="
echo "Started: $(date -u)"
echo "Host: $(uname -a)"
echo

echo "--- kubectl context ---"
kubectl config current-context || true

echo
echo "--- namespaces (brief) ---"
kubectl get ns || true

echo

echo "--- pv namespace resources ---"
kubectl -n pv get pods,svc -o wide || true

echo

echo "--- temporal namespace resources ---"
kubectl -n temporal get svc temporal-frontend -o wide || true
kubectl -n temporal get endpoints temporal-frontend -o yaml || true
kubectl -n temporal get pods -o wide || true

echo

# Run network checks from a pod in the `pv` namespace (uses netshoot image)
echo "--- network checks from pv namespace (netshoot) ---"
kubectl -n pv run --rm -i --restart=Never netshoot --image=nicolaka/netshoot --command -- sh -c '
  echo "dns lookup:"; nslookup temporal-frontend.temporal.svc.cluster.local || true; 
  echo "- host (short):"; getent hosts temporal-frontend.temporal.svc.cluster.local || true; 
  echo "- nc to svc DNS (7233):"; nc -vz temporal-frontend.temporal.svc.cluster.local 7233 || true; 
  echo "- nc to suspected IP (7233):"; nc -vz 10.43.47.212 7233 || true; 
  echo "- inspect /etc/resolv.conf:"; cat /etc/resolv.conf || true; 
'

echo

# Run network checks from a pod in the `temporal` namespace (if scheduling allowed)
echo "--- network checks from temporal namespace (netshoot) ---"
kubectl -n temporal run --rm -i --restart=Never netshoot --image=nicolaka/netshoot --command -- sh -c '
  echo "listening sockets on node (ss):"; ss -lntp || true; 
  echo "nc localhost 7233:"; nc -vz 127.0.0.1 7233 || true; 
  echo "ps aux (if available):"; ps aux || true; 
'

echo

# Try to find a likely frontend pod name and check its logs and open ports
echo "--- probing temporal frontend pod (best-effort) ---"
FRONTEND_POD=$(kubectl -n temporal get pods --no-headers -o custom-columns=":metadata.name" | grep -i "frontend\|temporal-frontend" | head -n1 || true)
if [ -z "$FRONTEND_POD" ]; then
  FRONTEND_POD=$(kubectl -n temporal get pods -o jsonpath='{.items[0].metadata.name}' || true)
fi

echo "Selected pod: $FRONTEND_POD"
if [ -n "$FRONTEND_POD" ]; then
  echo "--- frontend pod describe ---"
  kubectl -n temporal describe pod "$FRONTEND_POD" || true
  echo "--- frontend pod logs (last 200 lines) ---"
  kubectl -n temporal logs "$FRONTEND_POD" --tail=200 || true
  echo "--- frontend pod exec checks ---"
  kubectl -n temporal exec -i "$FRONTEND_POD" -- sh -c 'ss -lntp || netstat -lntp || true' || true
  kubectl -n temporal exec -i "$FRONTEND_POD" -- sh -c 'ps aux || true' || true
fi

echo

echo "--- cluster-wide networkpolicies (all namespaces) ---"
kubectl get networkpolicy --all-namespaces -o wide || true

echo

echo "Completed: $(date -u)"
echo "Logfile: $LOGFILE"

# Print a short footer for convenience
echo "==================== End diagnostics ===================="

# Exit with success (the script logs command failures but continues)
exit 0

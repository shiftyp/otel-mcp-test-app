#!/bin/bash

# Script to check status of services in k3d cluster
# Usage: ./k3d-status.sh [--watch]

set -e

# Configuration
CLUSTER_NAME="ecommerce"
NAMESPACE="ecommerce"
WATCH_MODE=false

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

# Parse arguments
if [[ "$1" == "--watch" ]] || [[ "$1" == "-w" ]]; then
    WATCH_MODE=true
fi

print_header() {
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}                    k3d E-Commerce Platform Status                      ${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_section() {
    echo -e "\n${BLUE}▶ $1${NC}"
    echo -e "${BLUE}$(printf '─%.0s' {1..70})${NC}"
}

check_cluster() {
    if ! k3d cluster list | grep -q "^$CLUSTER_NAME.*running"; then
        echo -e "${RED}✗ k3d cluster '$CLUSTER_NAME' is not running${NC}"
        exit 1
    else
        echo -e "${GREEN}✓ k3d cluster '$CLUSTER_NAME' is running${NC}"
    fi
}

show_deployments() {
    print_section "Deployments"
    kubectl -n $NAMESPACE get deployments -o custom-columns=\
"NAME:.metadata.name,\
READY:.status.readyReplicas,\
DESIRED:.spec.replicas,\
AVAILABLE:.status.availableReplicas,\
AGE:.metadata.creationTimestamp" | while IFS= read -r line; do
        if [[ $line == NAME* ]]; then
            echo -e "${YELLOW}$line${NC}"
        else
            # Color based on readiness
            if echo "$line" | grep -qE "([0-9]+)\s+\1\s+\1"; then
                echo -e "${GREEN}$line${NC}"
            else
                echo -e "${RED}$line${NC}"
            fi
        fi
    done
}

show_pods() {
    print_section "Pods"
    kubectl -n $NAMESPACE get pods -o custom-columns=\
"NAME:.metadata.name,\
READY:.status.containerStatuses[0].ready,\
STATUS:.status.phase,\
RESTARTS:.status.containerStatuses[0].restartCount,\
AGE:.metadata.creationTimestamp" | while IFS= read -r line; do
        if [[ $line == NAME* ]]; then
            echo -e "${YELLOW}$line${NC}"
        else
            # Color based on status
            if echo "$line" | grep -q "true.*Running"; then
                echo -e "${GREEN}$line${NC}"
            elif echo "$line" | grep -q "Pending\|ContainerCreating"; then
                echo -e "${YELLOW}$line${NC}"
            else
                echo -e "${RED}$line${NC}"
            fi
        fi
    done
}

show_services() {
    print_section "Services"
    kubectl -n $NAMESPACE get services -o custom-columns=\
"NAME:.metadata.name,\
TYPE:.spec.type,\
CLUSTER-IP:.spec.clusterIP,\
PORT(S):.spec.ports[*].port" | while IFS= read -r line; do
        if [[ $line == NAME* ]]; then
            echo -e "${YELLOW}$line${NC}"
        else
            echo "$line"
        fi
    done
}

show_ingress() {
    print_section "Ingress"
    if kubectl -n $NAMESPACE get ingress 2>/dev/null | grep -v "No resources found"; then
        kubectl -n $NAMESPACE get ingress
    else
        echo "No ingress configured"
    fi
}

show_persistent_volumes() {
    print_section "Persistent Volume Claims"
    kubectl -n $NAMESPACE get pvc -o custom-columns=\
"NAME:.metadata.name,\
STATUS:.status.phase,\
VOLUME:.spec.volumeName,\
CAPACITY:.status.capacity.storage,\
STORAGECLASS:.spec.storageClassName" 2>/dev/null || echo "No PVCs found"
}

show_recent_events() {
    print_section "Recent Events (last 10)"
    kubectl -n $NAMESPACE get events \
        --sort-by='.lastTimestamp' \
        -o custom-columns="TIME:.lastTimestamp,TYPE:.type,REASON:.reason,MESSAGE:.message" \
        | tail -n 11 | while IFS= read -r line; do
        if [[ $line == TIME* ]]; then
            echo -e "${YELLOW}$line${NC}"
        elif echo "$line" | grep -q "Warning"; then
            echo -e "${RED}$line${NC}"
        else
            echo "$line"
        fi
    done
}

show_resource_usage() {
    print_section "Resource Usage"
    echo -e "${YELLOW}Node Resources:${NC}"
    kubectl top nodes 2>/dev/null || echo "Metrics server not available"
    
    echo -e "\n${YELLOW}Pod Resources (Top 10 by CPU):${NC}"
    kubectl -n $NAMESPACE top pods --sort-by=cpu 2>/dev/null | head -n 11 || echo "Metrics server not available"
}

show_deployed_tags() {
    print_section "Deployed Image Tags"
    kubectl -n $NAMESPACE get deployments -o json | \
        jq -r '.items[] | .metadata.name as $name | .spec.template.spec.containers[] | "\($name): \(.image)"' | \
        while IFS= read -r line; do
            echo "  $line"
        done
}

show_urls() {
    print_section "Service URLs"
    echo -e "${GREEN}External Access:${NC}"
    echo "  Frontend (SSR):          http://localhost:4000"
    echo "  Frontend (Nginx):        http://localhost:80"
    echo "  User Service API:        http://localhost:3001"
    echo "  Product Service API:     http://localhost:3002"
    echo ""
    echo -e "${GREEN}Monitoring:${NC}"
    echo "  Jaeger UI:              http://localhost:16686"
    echo "  OpenSearch:             http://localhost:9200"
    echo "  OpenSearch Dashboards:  http://localhost:5601"
    echo "  Prometheus:             http://localhost:9090"
    echo "  Grafana:                http://localhost:3000"
}

show_logs_commands() {
    print_section "Useful Commands"
    echo "View logs:"
    echo "  kubectl -n $NAMESPACE logs -f deployment/user-service"
    echo "  kubectl -n $NAMESPACE logs -f deployment/product-service"
    echo "  kubectl -n $NAMESPACE logs -f deployment/frontend"
    echo ""
    echo "Execute commands:"
    echo "  kubectl -n $NAMESPACE exec -it deployment/user-service -- /bin/sh"
    echo ""
    echo "Port forward:"
    echo "  kubectl -n $NAMESPACE port-forward svc/service-name port:port"
}

# Main display function
display_status() {
    clear
    print_header
    echo -e "Time: $(date)\n"
    
    check_cluster
    show_deployments
    show_pods
    show_services
    show_persistent_volumes
    show_recent_events
    
    if [[ "$WATCH_MODE" == false ]]; then
        show_resource_usage
        show_deployed_tags
        show_urls
        show_logs_commands
    fi
}

# Main execution
if [[ "$WATCH_MODE" == true ]]; then
    echo "Watching status (press Ctrl+C to exit)..."
    while true; do
        display_status
        sleep 5
    done
else
    display_status
fi
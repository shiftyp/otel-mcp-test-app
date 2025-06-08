#!/bin/bash

# Master management script for k3d e-commerce platform
# Usage: ./k3d-manage.sh [command] [options]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLUSTER_NAME="ecommerce"

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

print_header() {
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}              k3d E-Commerce Platform Management Tool                    ${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_usage() {
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  setup           - Initialize k3d cluster and deploy all services"
    echo "  start           - Start existing k3d cluster"
    echo "  stop            - Stop k3d cluster"
    echo "  destroy         - Destroy k3d cluster and clean up"
    echo "  status          - Show cluster and services status"
    echo "  deploy          - Deploy/update services"
    echo "  rollback        - Rollback services to previous version"
    echo "  logs [service]  - Show logs for a service"
    echo "  exec [service]  - Execute shell in a service container"
    echo "  port-forward    - Set up port forwarding for all services"
    echo "  build-all       - Build all service images"
    echo "  test            - Run integration tests"
    echo "  backup          - Backup persistent data"
    echo "  restore         - Restore persistent data"
    echo ""
    echo "Options:"
    echo "  -h, --help      - Show this help message"
    echo "  -w, --watch     - Watch mode (for status command)"
}

# Command functions
cmd_setup() {
    echo -e "${GREEN}Setting up k3d cluster...${NC}"
    if [ -f "$SCRIPT_DIR/setup-k3d.sh" ]; then
        "$SCRIPT_DIR/setup-k3d.sh"
    else
        echo -e "${RED}setup-k3d.sh not found${NC}"
        exit 1
    fi
}

cmd_start() {
    echo -e "${GREEN}Starting k3d cluster...${NC}"
    k3d cluster start $CLUSTER_NAME
    echo -e "${GREEN}Cluster started. Setting up port forwards...${NC}"
    cmd_port_forward
}

cmd_stop() {
    echo -e "${YELLOW}Stopping k3d cluster...${NC}"
    k3d cluster stop $CLUSTER_NAME
    echo -e "${GREEN}Cluster stopped${NC}"
}

cmd_destroy() {
    echo -e "${RED}WARNING: This will destroy the cluster and all data!${NC}"
    read -p "Are you sure? (yes/no): " confirm
    if [[ "$confirm" == "yes" ]]; then
        k3d cluster delete $CLUSTER_NAME
        echo -e "${GREEN}Cluster destroyed${NC}"
        
        # Clean up deployment tags
        rm -f "$SCRIPT_DIR"/.last-deployed-*.tag
    else
        echo "Cancelled"
    fi
}

cmd_status() {
    if [ -f "$SCRIPT_DIR/k3d-status.sh" ]; then
        "$SCRIPT_DIR/k3d-status.sh" "$@"
    else
        echo -e "${RED}k3d-status.sh not found${NC}"
        exit 1
    fi
}

cmd_deploy() {
    if [ -f "$SCRIPT_DIR/deploy-service.sh" ]; then
        "$SCRIPT_DIR/deploy-service.sh" "$@"
    else
        echo -e "${RED}deploy-service.sh not found${NC}"
        exit 1
    fi
}

cmd_rollback() {
    if [ -f "$SCRIPT_DIR/rollback-service.sh" ]; then
        "$SCRIPT_DIR/rollback-service.sh" "$@"
    else
        echo -e "${RED}rollback-service.sh not found${NC}"
        exit 1
    fi
}

cmd_logs() {
    local service=$1
    if [ -z "$service" ]; then
        echo "Usage: $0 logs [service-name]"
        echo "Available services: user-service, product-service, frontend"
        exit 1
    fi
    
    echo -e "${GREEN}Showing logs for $service...${NC}"
    kubectl -n ecommerce logs -f deployment/$service
}

cmd_exec() {
    local service=$1
    if [ -z "$service" ]; then
        echo "Usage: $0 exec [service-name]"
        echo "Available services: user-service, product-service, frontend"
        exit 1
    fi
    
    echo -e "${GREEN}Executing shell in $service...${NC}"
    kubectl -n ecommerce exec -it deployment/$service -- /bin/sh
}

cmd_port_forward() {
    echo -e "${GREEN}Setting up port forwards...${NC}"
    
    # Kill existing port-forward processes
    pkill -f "kubectl.*port-forward" || true
    
    # Function to create port-forward in background
    create_port_forward() {
        local service=$1
        local port=$2
        echo "Port forwarding $service on port $port..."
        kubectl -n ecommerce port-forward svc/$service $port:$port > /dev/null 2>&1 &
    }
    
    # Create port forwards
    create_port_forward "user-service" 3001
    create_port_forward "product-service" 3002
    create_port_forward "frontend" 4000
    create_port_forward "frontend-nginx" 80
    create_port_forward "jaeger" 16686
    create_port_forward "otel-collector" 4317
    create_port_forward "opensearch" 9200
    create_port_forward "opensearch-dashboards" 5601
    
    echo -e "${GREEN}Port forwards established${NC}"
    echo ""
    echo "Services available at:"
    echo "  Frontend (SSR): http://localhost:4000"
    echo "  Frontend (Nginx): http://localhost:80"
    echo "  User Service: http://localhost:3001"
    echo "  Product Service: http://localhost:3002"
    echo "  Jaeger UI: http://localhost:16686"
    echo "  OpenSearch: http://localhost:9200"
    echo "  OpenSearch Dashboards: http://localhost:5601"
}

cmd_build_all() {
    echo -e "${GREEN}Building all services...${NC}"
    
    local services=("user-service" "product-service" "frontend")
    for service in "${services[@]}"; do
        echo -e "${BLUE}Building $service...${NC}"
        cmd_deploy "$service"
    done
    
    echo -e "${GREEN}All services built and deployed${NC}"
}

cmd_test() {
    echo -e "${GREEN}Running integration tests...${NC}"
    
    # Check if services are healthy
    echo "Checking service health..."
    
    # Test user service
    if curl -f http://localhost:3001/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ User service is healthy${NC}"
    else
        echo -e "${RED}✗ User service is not responding${NC}"
    fi
    
    # Test product service
    if curl -f http://localhost:3002/health > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Product service is healthy${NC}"
    else
        echo -e "${RED}✗ Product service is not responding${NC}"
    fi
    
    # Test frontend
    if curl -f http://localhost:4000 > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Frontend is accessible${NC}"
    else
        echo -e "${RED}✗ Frontend is not responding${NC}"
    fi
    
    # Test OpenTelemetry
    if curl -f http://localhost:4317 > /dev/null 2>&1; then
        echo -e "${GREEN}✓ OpenTelemetry collector is running${NC}"
    else
        echo -e "${YELLOW}⚠ OpenTelemetry collector may not be accessible${NC}"
    fi
}

cmd_backup() {
    echo -e "${GREEN}Backing up persistent data...${NC}"
    
    local backup_dir="$SCRIPT_DIR/backups/$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$backup_dir"
    
    # Backup PostgreSQL
    echo "Backing up PostgreSQL..."
    kubectl -n ecommerce exec postgres-0 -- pg_dump -U postgres ecommerce_users > "$backup_dir/postgres-backup.sql"
    
    # Backup MongoDB
    echo "Backing up MongoDB..."
    kubectl -n ecommerce exec mongodb-0 -- mongodump --archive --gzip > "$backup_dir/mongodb-backup.gz"
    
    echo -e "${GREEN}Backup completed: $backup_dir${NC}"
}

cmd_restore() {
    echo -e "${YELLOW}Restore functionality not yet implemented${NC}"
}

# Main script
main() {
    if [ $# -eq 0 ]; then
        print_header
        print_usage
        exit 0
    fi
    
    local command=$1
    shift
    
    case "$command" in
        setup)
            cmd_setup "$@"
            ;;
        start)
            cmd_start "$@"
            ;;
        stop)
            cmd_stop "$@"
            ;;
        destroy)
            cmd_destroy "$@"
            ;;
        status)
            cmd_status "$@"
            ;;
        deploy)
            cmd_deploy "$@"
            ;;
        rollback)
            cmd_rollback "$@"
            ;;
        logs)
            cmd_logs "$@"
            ;;
        exec)
            cmd_exec "$@"
            ;;
        port-forward)
            cmd_port_forward "$@"
            ;;
        build-all)
            cmd_build_all "$@"
            ;;
        test)
            cmd_test "$@"
            ;;
        backup)
            cmd_backup "$@"
            ;;
        restore)
            cmd_restore "$@"
            ;;
        -h|--help)
            print_header
            print_usage
            ;;
        *)
            echo -e "${RED}Unknown command: $command${NC}"
            print_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"
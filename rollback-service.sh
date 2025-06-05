#!/bin/bash

# Script to rollback services in k3d cluster
# Usage: ./rollback-service.sh [service1] [service2] ...

set -e

# Configuration
CLUSTER_NAME="ecommerce"
NAMESPACE="ecommerce"

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Available services
declare -A SERVICES=(
    ["user-service"]="backend/user-service"
    ["product-service"]="backend/product-service"
    ["frontend"]="frontend/angular-app"
)

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to rollback service
rollback_service() {
    local service_name=$1
    local deployment_name=$service_name
    
    print_info "Rolling back $service_name..."
    
    # Get rollout history
    print_info "Rollout history for $deployment_name:"
    kubectl -n $NAMESPACE rollout history deployment/$deployment_name
    
    # Perform rollback
    if kubectl -n $NAMESPACE rollout undo deployment/$deployment_name; then
        print_success "Initiated rollback for $service_name"
        
        # Wait for rollback to complete
        print_info "Waiting for rollback to complete..."
        kubectl -n $NAMESPACE rollout status deployment/$deployment_name --timeout=120s
        
        print_success "Rollback completed for $service_name"
    else
        print_error "Failed to rollback $service_name"
        return 1
    fi
    
    # Show current state
    echo ""
    kubectl -n $NAMESPACE get deployment $deployment_name -o wide
    echo ""
    kubectl -n $NAMESPACE get pods -l app=$service_name
    echo ""
}

# Function to select services interactively
select_services() {
    local selected_services=()
    
    echo "Available services:"
    echo ""
    
    local i=1
    local service_array=()
    for service in "${!SERVICES[@]}"; do
        # Check if deployment exists
        if kubectl -n $NAMESPACE get deployment $service &>/dev/null; then
            echo "  $i) $service"
            service_array+=("$service")
            ((i++))
        fi
    done
    echo "  q) Quit"
    echo ""
    
    while true; do
        read -p "Select service(s) to rollback (comma-separated numbers or 'q' to quit): " selection
        
        if [[ "$selection" == "q" ]]; then
            exit 0
        else
            # Parse comma-separated numbers
            IFS=',' read -ra SELECTIONS <<< "$selection"
            for sel in "${SELECTIONS[@]}"; do
                sel=$(echo "$sel" | tr -d ' ')
                if [[ "$sel" =~ ^[0-9]+$ ]] && [ "$sel" -ge 1 ] && [ "$sel" -le "${#service_array[@]}" ]; then
                    selected_services+=("${service_array[$((sel-1))]}")
                else
                    print_warning "Invalid selection: $sel"
                fi
            done
            
            if [ ${#selected_services[@]} -gt 0 ]; then
                break
            fi
        fi
    done
    
    echo "${selected_services[@]}"
}

# Main script
main() {
    print_info "k3d Service Rollback Tool"
    echo ""
    
    # Check if cluster is running
    if ! k3d cluster list | grep -q "^$CLUSTER_NAME.*running"; then
        print_error "k3d cluster '$CLUSTER_NAME' is not running"
        exit 1
    fi
    
    # Determine which services to rollback
    local services_to_rollback=()
    
    if [ $# -eq 0 ]; then
        # No arguments, show interactive menu
        services_to_rollback=($(select_services))
    else
        # Validate provided service names
        for service in "$@"; do
            if [[ -n "${SERVICES[$service]}" ]]; then
                services_to_rollback+=("$service")
            else
                print_error "Unknown service: $service"
                print_info "Available services: ${!SERVICES[*]}"
                exit 1
            fi
        done
    fi
    
    # Rollback selected services
    print_info "Rolling back services: ${services_to_rollback[*]}"
    echo ""
    
    local failed_services=()
    for service in "${services_to_rollback[@]}"; do
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        print_info "Rolling back $service"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        
        if ! rollback_service "$service"; then
            failed_services+=("$service")
        fi
        
        echo ""
    done
    
    # Summary
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_info "Rollback Summary"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if [ ${#failed_services[@]} -eq 0 ]; then
        print_success "All services rolled back successfully!"
    else
        print_error "Failed to rollback: ${failed_services[*]}"
        exit 1
    fi
}

# Run main function
main "$@"
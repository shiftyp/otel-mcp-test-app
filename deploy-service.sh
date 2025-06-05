#!/bin/bash

# Script to build and deploy services to k3d cluster
# Usage: ./deploy-service.sh [service1] [service2] ...
# If no services specified, it will prompt for selection

set -e

# Configuration
CLUSTER_NAME="ecommerce"
REGISTRY_NAME="k3d-registry.localhost"
REGISTRY_PORT="5111"
NAMESPACE="ecommerce"

# Color codes for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Available services
declare -A SERVICES=(
    ["user-service"]="backend/user-service"
    ["product-service"]="backend/product-service"
    ["frontend"]="frontend/angular-app"
)

# Function to print colored output
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

# Function to check if k3d cluster is running
check_cluster() {
    if ! k3d cluster list | grep -q "^$CLUSTER_NAME.*running"; then
        print_error "k3d cluster '$CLUSTER_NAME' is not running"
        print_info "Start it with: k3d cluster start $CLUSTER_NAME"
        exit 1
    fi
}

# Function to generate unique tag
generate_tag() {
    echo "$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD 2>/dev/null || echo 'nogit')"
}

# Function to build and push service
build_and_push_service() {
    local service_name=$1
    local service_path=${SERVICES[$service_name]}
    local tag=$(generate_tag)
    local image_name="$service_name:$tag"
    local registry_image="$REGISTRY_NAME:$REGISTRY_PORT/$image_name"
    
    print_info "Building $service_name with tag $tag..."
    
    # Build the image
    if docker build -t "$image_name" "./$service_path"; then
        print_success "Built $image_name"
    else
        print_error "Failed to build $service_name"
        return 1
    fi
    
    # Tag for registry
    docker tag "$image_name" "$registry_image"
    
    # Push to registry
    print_info "Pushing to k3d registry..."
    if docker push "$registry_image"; then
        print_success "Pushed $registry_image"
    else
        print_error "Failed to push $service_name to registry"
        return 1
    fi
    
    # Update Kubernetes deployment
    print_info "Updating Kubernetes deployment..."
    
    # Determine the deployment name (might be different from service name)
    local deployment_name=$service_name
    if [[ "$service_name" == "frontend" ]]; then
        # Frontend might have multiple deployments
        kubectl -n $NAMESPACE set image deployment/frontend frontend=$registry_image || true
        kubectl -n $NAMESPACE set image deployment/frontend-nginx nginx=$registry_image || true
    else
        kubectl -n $NAMESPACE set image deployment/$deployment_name $service_name=$registry_image
    fi
    
    # Wait for rollout
    print_info "Waiting for rollout to complete..."
    kubectl -n $NAMESPACE rollout status deployment/$deployment_name --timeout=120s
    
    print_success "Successfully deployed $service_name:$tag"
    
    # Show deployment info
    echo ""
    print_info "Deployment info:"
    kubectl -n $NAMESPACE get deployment $deployment_name -o wide
    echo ""
    kubectl -n $NAMESPACE get pods -l app=$service_name
    echo ""
    
    # Save the tag for potential rollback
    echo "$tag" > ".last-deployed-$service_name.tag"
    
    return 0
}

# Function to select services interactively
select_services() {
    local selected_services=()
    
    echo "Available services:"
    echo ""
    
    local i=1
    local service_array=()
    for service in "${!SERVICES[@]}"; do
        echo "  $i) $service"
        service_array+=("$service")
        ((i++))
    done
    echo "  a) All services"
    echo "  q) Quit"
    echo ""
    
    while true; do
        read -p "Select service(s) to deploy (comma-separated numbers, 'a' for all, or 'q' to quit): " selection
        
        if [[ "$selection" == "q" ]]; then
            exit 0
        elif [[ "$selection" == "a" ]]; then
            selected_services=("${!SERVICES[@]}")
            break
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

# Function to show last deployed tags
show_deployed_tags() {
    print_info "Last deployed tags:"
    for service in "${!SERVICES[@]}"; do
        if [ -f ".last-deployed-$service.tag" ]; then
            local tag=$(cat ".last-deployed-$service.tag")
            echo "  $service: $tag"
        else
            echo "  $service: <not deployed>"
        fi
    done
    echo ""
}

# Main script
main() {
    print_info "k3d Service Deployment Tool"
    echo ""
    
    # Check if cluster is running
    check_cluster
    
    # Show current deployment status
    show_deployed_tags
    
    # Determine which services to deploy
    local services_to_deploy=()
    
    if [ $# -eq 0 ]; then
        # No arguments, show interactive menu
        services_to_deploy=($(select_services))
    else
        # Validate provided service names
        for service in "$@"; do
            if [[ -n "${SERVICES[$service]}" ]]; then
                services_to_deploy+=("$service")
            else
                print_error "Unknown service: $service"
                print_info "Available services: ${!SERVICES[*]}"
                exit 1
            fi
        done
    fi
    
    # Deploy selected services
    print_info "Deploying services: ${services_to_deploy[*]}"
    echo ""
    
    local failed_services=()
    for service in "${services_to_deploy[@]}"; do
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        print_info "Deploying $service"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        
        if ! build_and_push_service "$service"; then
            failed_services+=("$service")
        fi
        
        echo ""
    done
    
    # Summary
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    print_info "Deployment Summary"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if [ ${#failed_services[@]} -eq 0 ]; then
        print_success "All services deployed successfully!"
    else
        print_error "Failed to deploy: ${failed_services[*]}"
        exit 1
    fi
    
    echo ""
    print_info "View logs with:"
    for service in "${services_to_deploy[@]}"; do
        echo "  kubectl -n $NAMESPACE logs -f deployment/$service"
    done
}

# Run main function
main "$@"
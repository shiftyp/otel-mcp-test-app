#!/bin/bash

# Setup script for k3d cluster with local development

set -e

CLUSTER_NAME="ecommerce"
REGISTRY_NAME="localhost"
REGISTRY_PORT="5000"

echo "🚀 Setting up k3d cluster for e-commerce platform..."

# Check if k3d is installed
if ! command -v k3d &> /dev/null; then
    echo "❌ k3d is not installed. Please install k3d first."
    echo "Visit: https://k3d.io/v5.4.6/#installation"
    exit 1
fi

# Check if docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Delete existing cluster if it exists
if k3d cluster list | grep -q "$CLUSTER_NAME"; then
    echo "🗑️  Deleting existing cluster..."
    k3d cluster delete "$CLUSTER_NAME"
fi

# Create k3d cluster with local registry
echo "📦 Creating k3d cluster with local registry..."
k3d cluster create "$CLUSTER_NAME" \
    --servers 1 \
    --agents 2 \
    --port "80:80@loadbalancer" \
    --port "443:443@loadbalancer" \
    --registry-create "${CLUSTER_NAME}-registry:${REGISTRY_PORT}" \
    --k3s-arg "--disable=traefik@server:0" \
    --volume "$(pwd)/k8s:/k8s@all" \
    --wait

echo "⏳ Waiting for cluster to be ready..."
kubectl wait --for=condition=ready node --all --timeout=300s

# Wait for registry to be ready
echo "🔍 Checking registry health..."

# Get the actual registry name created by k3d
INTERNAL_REGISTRY_NAME="${CLUSTER_NAME}-registry"
INTERNAL_REGISTRY_HOST="${REGISTRY_NAME}:${REGISTRY_PORT}"
INTERNAL_REGISTRY_URL="${INTERNAL_REGISTRY_HOST}"

# First check if registry container is running
echo "  Checking registry container status..."
if ! docker ps | grep -q "${INTERNAL_REGISTRY_NAME}"; then
    echo "❌ Registry container is not running"
    docker ps -a | grep registry
    exit 1
fi

# Check registry health
max_retries=30
retry_count=0
while true; do
    retry_count=$((retry_count + 1))
    if [ $retry_count -gt $max_retries ]; then
        echo "❌ Registry failed to become ready after $max_retries attempts"
        echo "  Registry logs:"
        docker logs "${REGISTRY_NAME}" --tail 50
        exit 1
    fi
    
    # Try both localhost and registry name
    if curl -s -f http://localhost:${REGISTRY_PORT}/v2/_catalog > /dev/null 2>&1; then
        echo "✅ Registry is ready at localhost:${REGISTRY_PORT}!"
        REGISTRY_URL="localhost:${REGISTRY_PORT}"
        break
    else
        echo "  Waiting for registry (attempt $retry_count/$max_retries)..."
        sleep 2
    fi
done

# Pull and push external images to local registry
echo "📥 Pulling and pushing external images to local registry..."

# Function to pull and push external images with retry logic
pull_and_push_image() {
    local image=$1
    local tag=${2:-latest}
    local full_image="${image}:${tag}"
    local registry_image="${REGISTRY_URL}/${image##*/}:local"
    
    echo "  → Processing ${full_image}..."
    
    # Pull image
    echo "    - Pulling image..."
    if ! docker pull "${full_image}"; then
        echo "    ❌ Failed to pull ${full_image}"
        return 1
    fi
    
    # Tag image
    echo "    - Tagging as ${registry_image}..."
    docker tag "${full_image}" "${registry_image}"
    
    # Push with retry logic
    echo "    - Pushing to local registry..."
    local push_retries=5
    local push_count=0
    local push_success=false
    
    while [ $push_count -lt $push_retries ]; do
        push_count=$((push_count + 1))
        
        if docker push "${registry_image}" 2>&1; then
            push_success=true
            break
        else
            if [ $push_count -lt $push_retries ]; then
                echo "    ⚠️  Push failed (attempt $push_count/$push_retries), retrying in $((push_count * 2)) seconds..."
                sleep $((push_count * 2))
            fi
        fi
    done
    
    if [ "$push_success" = true ]; then
        echo "  ✅ Successfully pushed ${image##*/}:${tag}"
    else
        echo "  ❌ Failed to push ${image##*/}:${tag} after $push_retries attempts"
        return 1
    fi
    echo ""
}

# Pull and push all external images
echo "📦 Processing external images..."
pull_and_push_image "busybox" "latest"
pull_and_push_image "ghcr.io/open-feature/flagd" "latest"
pull_and_push_image "jaegertracing/all-in-one" "1.52"
pull_and_push_image "mongo" "8"
pull_and_push_image "nginx" "alpine"
pull_and_push_image "opensearchproject/opensearch" "2.11.1"
pull_and_push_image "opensearchproject/opensearch-dashboards" "2.11.1"
pull_and_push_image "otel/opentelemetry-collector-contrib" "0.126.0"
pull_and_push_image "postgres" "16-alpine"
pull_and_push_image "redis" "7-alpine"

# Function to build and push application images
build_and_push_app() {
    local app_name=$1
    local app_path=$2
    local image_name="${app_name}:local"
    local registry_image="${REGISTRY_URL}/${app_name}:local"
    
    echo "🔨 Building ${app_name}..."
    
    # Build image
    if ! docker build -t "${image_name}" "${app_path}"; then
        echo "❌ Failed to build ${app_name}"
        return 1
    fi
    
    # Tag image
    docker tag "${image_name}" "${registry_image}"
    
    # Push with retry logic
    local push_retries=3
    local push_count=0
    local push_success=false
    
    while [ $push_count -lt $push_retries ]; do
        push_count=$((push_count + 1))
        echo "  Pushing ${app_name} (attempt $push_count/$push_retries)..."
        
        if docker push "${registry_image}" 2>&1; then
            push_success=true
            echo "✅ Successfully pushed ${app_name}"
            break
        else
            if [ $push_count -lt $push_retries ]; then
                echo "  ⚠️  Push failed, retrying in 3 seconds..."
                sleep 3
            fi
        fi
    done
    
    if [ "$push_success" = false ]; then
        echo "❌ Failed to push ${app_name} after $push_retries attempts"
        return 1
    fi
    echo ""
}

# Build and push application images
echo "🏗️  Building Docker images..."
build_and_push_app "user-service" "./backend/user-service"
build_and_push_app "product-service" "./backend/product-service"
build_and_push_app "frontend" "./frontend/angular-app"

# Verify all images are available in registry
echo "🔍 Verifying images in registry..."
verify_registry_images() {
    local failed=0
    
    # List of all images we expect in the registry
    local images=(
        "busybox:local"
        "flagd:local"
        "all-in-one:local"
        "mongo:local"
        "nginx:local"
        "opensearch:local"
        "opensearch-dashboards:local"
        "opentelemetry-collector-contrib:local"
        "postgres:local"
        "redis:local"
        "user-service:local"
        "product-service:local"
        "frontend:local"
    )
    
    echo "  Checking registry catalog..."
    local catalog=$(curl -s http://${REGISTRY_URL}/v2/_catalog)
    echo "  Registry contains: ${catalog}"
    
    for image_tag in "${images[@]}"; do
        local image_name="${image_tag%:*}"
        local tag="${image_tag#*:}"
        
        # Check if image exists in registry
        if curl -s -f -I "http://${REGISTRY_URL}/v2/${image_name}/manifests/${tag}" > /dev/null 2>&1; then
            echo "  ✅ ${image_name}:${tag} - OK"
        else
            echo "  ❌ ${image_name}:${tag} - NOT FOUND"
            failed=$((failed + 1))
        fi
    done
    
    if [ $failed -gt 0 ]; then
        echo ""
        echo "⚠️  Warning: ${failed} images are missing from the registry"
        echo "  The deployment may fail. Consider re-running the setup."
    else
        echo ""
        echo "✅ All images verified in registry!"
    fi
}

verify_registry_images

# Apply Kubernetes manifests using dev overlay
echo "🚀 Deploying to Kubernetes with dev overlay..."
kubectl apply -k k8s/overlays/dev/

# Wait for deployments to be ready
echo "⏳ Waiting for deployments to be ready..."
kubectl -n ecommerce wait --for=condition=available --timeout=300s deployment --all

# Create port forwards for development
echo "🔗 Setting up port forwards..."

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

echo ""
echo "✅ k3d cluster setup complete!"
echo ""
echo "📋 Cluster Information:"
echo "   Cluster Name: $CLUSTER_NAME"
echo "   Registry: $REGISTRY_NAME:$REGISTRY_PORT"
echo ""
echo "🔗 Service URLs:"
echo "   Frontend (SSR): http://localhost:4000"
echo "   Frontend (Nginx): http://localhost"
echo "   User Service: http://localhost:3001"
echo "   Product Service: http://localhost:3002"
echo "   Jaeger UI: http://localhost:16686"
echo "   OpenSearch: http://localhost:9200"
echo "   OpenSearch Dashboards: http://localhost:5601"
echo "   OTEL Collector: localhost:4317"
echo ""
echo "📝 Useful commands:"
echo "   kubectl -n ecommerce get pods"
echo "   kubectl -n ecommerce logs -f deployment/user-service"
echo "   kubectl -n ecommerce logs -f deployment/product-service"
echo "   k3d cluster stop $CLUSTER_NAME"
echo "   k3d cluster start $CLUSTER_NAME"
echo "   k3d cluster delete $CLUSTER_NAME"
echo ""
echo "⚠️  Note: Port forwards are running in the background. Kill this script to stop them."
echo ""

# Keep script running to maintain port forwards
echo "Press Ctrl+C to stop port forwards and exit..."
wait
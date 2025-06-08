#!/bin/bash

# Setup script for local registry with existing Kind cluster

set -e

REGISTRY_NAME="ecommerce-registry"
REGISTRY_PORT="5000"
REGISTRY_URL="localhost:${REGISTRY_PORT}"

echo "🚀 Setting up local registry for Kind cluster..."

# Check if docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if kubectl can connect to cluster
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Cannot connect to Kubernetes cluster. Please ensure Kind cluster is running."
    exit 1
fi

echo "✅ Connected to Kubernetes cluster"

# Create local registry if it doesn't exist
if [ "$(docker inspect -f '{{.State.Running}}' "${REGISTRY_NAME}" 2>/dev/null || true)" != 'true' ]; then
    echo "📦 Creating local registry..."
    docker run -d --restart=always -p "${REGISTRY_PORT}:5000" --name "${REGISTRY_NAME}" registry:2
else
    echo "✅ Registry ${REGISTRY_NAME} already running"
fi

# Wait for registry to be ready
echo "🔍 Checking registry health..."
max_retries=30
retry_count=0
while true; do
    retry_count=$((retry_count + 1))
    if [ $retry_count -gt $max_retries ]; then
        echo "❌ Registry failed to become ready after $max_retries attempts"
        exit 1
    fi
    
    if curl -s -f http://${REGISTRY_URL}/v2/_catalog > /dev/null 2>&1; then
        echo "✅ Registry is ready at ${REGISTRY_URL}!"
        break
    else
        echo "  Waiting for registry (attempt $retry_count/$max_retries)..."
        sleep 2
    fi
done

# Connect the registry to the kind network if not already connected
echo "🔗 Connecting registry to Kind network..."
if docker network ls | grep -q "kind"; then
    if ! docker network inspect kind | grep -q "${REGISTRY_NAME}"; then
        docker network connect "kind" "${REGISTRY_NAME}" || true
    fi
    echo "✅ Registry connected to Kind network"
else
    echo "⚠️  Kind network not found. Registry will use default network."
fi

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

# For Kind, we need to ensure the registry URL matches
# Since both k3d and Kind now use ecommerce-registry:5000, no changes needed
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
create_port_forward "frontend-nginx" 8080
create_port_forward "jaeger" 16686
create_port_forward "otel-collector" 4317
create_port_forward "opensearch" 9200
create_port_forward "opensearch-dashboards" 5601

echo ""
echo "✅ Kind cluster setup complete!"
echo ""
echo "📋 Cluster Information:"
echo "   Registry: ${REGISTRY_URL}"
echo ""
echo "🔗 Service URLs:"
echo "   Frontend (SSR): http://localhost:4000"
echo "   Frontend (Nginx): http://localhost:8080"
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
echo "   docker logs ${REGISTRY_NAME}"
echo ""
echo "⚠️  Note: Port forwards are running in the background. Kill this script to stop them."
echo ""

# Keep script running to maintain port forwards
echo "Press Ctrl+C to stop port forwards and exit..."
wait
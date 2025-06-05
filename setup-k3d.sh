#!/bin/bash

# Setup script for k3d cluster with local development

set -e

CLUSTER_NAME="ecommerce"
REGISTRY_NAME="k3d-registry.localhost"
REGISTRY_PORT="5111"

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
    --registry-create "$REGISTRY_NAME:0.0.0.0:$REGISTRY_PORT" \
    --k3s-arg "--disable=traefik@server:0" \
    --volume "$(pwd)/k8s:/k8s@all" \
    --wait

echo "⏳ Waiting for cluster to be ready..."
kubectl wait --for=condition=ready node --all --timeout=300s

# Build and push images to local registry
echo "🏗️  Building Docker images..."

# Build user-service
echo "Building user-service..."
docker build -t user-service:local ./backend/user-service
docker tag user-service:local "$REGISTRY_NAME:$REGISTRY_PORT/user-service:local"
docker push "$REGISTRY_NAME:$REGISTRY_PORT/user-service:local"

# Build product-service
echo "Building product-service..."
docker build -t product-service:local ./backend/product-service
docker tag product-service:local "$REGISTRY_NAME:$REGISTRY_PORT/product-service:local"
docker push "$REGISTRY_NAME:$REGISTRY_PORT/product-service:local"

# Build frontend
echo "Building frontend..."
docker build -t frontend:local ./frontend/angular-app
docker tag frontend:local "$REGISTRY_NAME:$REGISTRY_PORT/frontend:local"
docker push "$REGISTRY_NAME:$REGISTRY_PORT/frontend:local"

# Update image references in Kubernetes manifests to use local registry
echo "📝 Updating Kubernetes manifests for local registry..."
sed -i.bak "s|image: user-service:local|image: $REGISTRY_NAME:$REGISTRY_PORT/user-service:local|g" k8s/base/user-service.yaml
sed -i.bak "s|image: product-service:local|image: $REGISTRY_NAME:$REGISTRY_PORT/product-service:local|g" k8s/base/product-service.yaml
sed -i.bak "s|image: frontend:local|image: $REGISTRY_NAME:$REGISTRY_PORT/frontend:local|g" k8s/base/frontend.yaml

# Apply Kubernetes manifests
echo "🚀 Deploying to Kubernetes..."
kubectl apply -k k8s/base/

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
# Modern E-commerce Platform with Advanced Observability

A production-ready e-commerce platform demonstrating best practices in microservices architecture, modern frontend development, and comprehensive observability using OpenTelemetry.

## Technology Stack

### Frontend
- **Framework**: Angular v20 with Server-Side Rendering (SSR)
- **Telemetry**: Custom Angular Telemetry Package
  - Decorator-based instrumentation (@Traced, @Metric, @Logged)
  - Angular Signals & Effects tracing
  - RxJS-powered metric batching
  - Smart adaptive sampling
  - Web Vitals integration
  - Real-time telemetry monitoring

### Backend Services
- **Architecture**: Node.js TypeScript Microservices
  - User Service (PostgreSQL)
  - Product Service (MongoDB)
  - Cart Service (Redis)
- **Communication**: REST APIs with OpenTelemetry trace propagation
- **Authentication**: JWT-based auth with telemetry integration

### Infrastructure
- **Databases**: PostgreSQL, MongoDB, Redis
- **Observability**: 
  - OpenTelemetry Collector (gRPC endpoints)
  - Jaeger for distributed tracing
  - Prometheus for metrics
  - OpenSearch for logs
- **Container Orchestration**: Kubernetes (K3d/Kind)
- **API Gateway**: NGINX with OpenTelemetry module
- **Feature Flags**: OpenFeature with flagd

## Project Structure

```
/
├── backend/
│   ├── cart-service/       # Shopping cart management (Redis)
│   ├── product-service/    # Product catalog (MongoDB)
│   ├── user-service/       # User management (PostgreSQL)
│   └── nginx/              # API Gateway with OpenTelemetry
├── frontend/
│   └── angular-app/        # Angular v20 SSR application
│       └── packages/
│           └── angular-telemetry/  # Custom telemetry library
├── k8s/                    # Kubernetes manifests
│   ├── base/               # Base configurations
│   └── overlays/           # Environment-specific configs
├── load-testing/           # K6 performance tests
│   └── k6-scripts/         # Browser & API test scenarios
├── docs/                   # Architecture documentation
└── otel-collector-config.yaml  # OpenTelemetry configuration
```

## Key Features

### Observability
- **Distributed Tracing**: End-to-end request tracing from browser to database
- **Metrics Collection**: Business metrics, performance metrics, and Web Vitals
- **Structured Logging**: Correlated logs with trace context
- **Real-time Monitoring**: Live telemetry dashboards using RxJS observables

### Performance
- **Smart Sampling**: Adaptive sampling based on operation importance and frequency
- **Metric Batching**: RxJS-powered batching with backpressure handling
- **SSR Optimization**: Server-side telemetry with state transfer
- **Web Vitals**: Automatic Core Web Vitals collection and correlation

### Developer Experience
- **Decorator-based API**: Clean separation of telemetry from business logic
- **Type Safety**: Full TypeScript support with type inference
- **Framework Integration**: Deep Angular integration (Signals, Effects, SSR)
- **Flexible APIs**: Both declarative (decorators) and imperative approaches

## Quick Start

### Local Development
```bash
# Start all services with Docker Compose
docker-compose up -d

# Access the application
open http://localhost:80

# View traces in Jaeger
open http://localhost:16686
```

### Kubernetes Deployment
```bash
# Setup K3d cluster
./setup-k3d.sh

# Deploy all services
./deploy-service-k3d.sh all

# Check status
./status-k3d.sh
```

### Load Testing
```bash
# Run interactive test suite
./load-testing/run-telemetry-tests.sh

# Run specific test
k6 run load-testing/k6-scripts/browser-telemetry-test.js
```

## Documentation

- [Angular Telemetry Package](./frontend/angular-app/packages/angular-telemetry/README.md)
- [Architecture Decision Records](./frontend/angular-app/packages/angular-telemetry/docs/adr/)
- [Load Testing Guide](./load-testing/README.md)
- [Optimizations Guide](./docs/OPTIMIZATIONS-GUIDE.md)

## Contributing

Contributions are welcome! Please read our contributing guidelines and check the architecture decision records before making significant changes.

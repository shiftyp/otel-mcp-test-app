# Modern E-commerce Platform

This project is a small e-commerce website built with a modern, scalable, and observable tech stack.

## Technology Stack

- **Frontend**: Angular v20 (with Server-Side Rendering)
- **Backend**: Node.js with TypeScript (Microservices architecture)
  - User Service
  - Product Service
- **Databases**:
  - PostgreSQL: For user data
  - MongoDB: For product catalog
- **Caching**: Redis
- **Observability**: OpenTelemetry (Collector, Traces, Metrics, Logs)
- **Containerization**: Docker
- **Orchestration**: Kubernetes

## Project Structure

```
/
├── backend/
│   ├── product-service/    # Manages product data (MongoDB)
│   └── user-service/       # Manages user data (PostgreSQL)
├── frontend/
│   └── angular-app/        # Angular v20 SSR application
├── kubernetes/             # Kubernetes manifests
├── otel-collector/         # OpenTelemetry Collector configuration
└── README.md
```

## Setup and Deployment

Detailed instructions for setting up each service, building Docker images, and deploying to Kubernetes will be provided within their respective directories or a dedicated deployment guide.

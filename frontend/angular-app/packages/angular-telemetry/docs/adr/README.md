# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Angular Telemetry package.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001](./001-decorator-based-instrumentation.md) | Decorator-Based Instrumentation | Accepted | 2025-06-06 |
| [ADR-002](./002-unified-telemetry-decorator.md) | Unified @Telemetry Class Decorator | Accepted | 2025-06-06 |
| [ADR-003](./003-type-safe-callbacks.md) | Type-Safe Telemetry Callbacks | Accepted | 2025-06-06 |
| [ADR-004](./004-universal-traced-decorator.md) | Universal @Traced Decorator | Accepted | 2025-06-06 |
| [ADR-005](./005-imperative-declarative-coexistence.md) | Coexistence of Imperative and Declarative APIs | Accepted | 2025-06-06 |
| [ADR-006](./006-core-architecture.md) | Core Architecture of Angular Telemetry Package | Accepted | 2025-06-06 |
| [ADR-007](./007-ssr-architecture.md) | Server-Side Rendering (SSR) Telemetry Architecture | Accepted | 2025-06-06 |
| [ADR-008](./008-signal-effect-tracing.md) | Angular Signal and Effect Tracing Architecture | Accepted | 2025-01-06 |
| [ADR-009](./009-avoiding-proxy-performance-overhead.md) | Avoiding Proxy Performance Overhead in Signal Tracing | Accepted | 2025-06-06 |
| [ADR-010](./010-metric-batching-strategy.md) | RxJS-Based Metric Batching Strategy | Accepted | 2025-06-08 |
| [ADR-011](./011-smart-sampling-strategy.md) | Smart Sampling Strategy | Accepted | 2025-06-08 |
| [ADR-012](./012-web-vitals-integration.md) | Web Vitals Integration | Accepted | 2025-06-08 |
| [ADR-013](./013-signal-change-tracking-stream.md) | Signal Change Tracking Stream | Accepted | 2025-06-08 |
| [ADR-014](./014-effect-loop-detection.md) | Effect Loop Detection with RxJS | Accepted | 2025-06-08 |
| [ADR-015](./015-span-context-propagation.md) | Span Context Propagation with RxJS | Accepted | 2025-06-08 |
| [ADR-016](./016-request-scoped-telemetry.md) | Request-Scoped Telemetry Stream | Accepted | 2025-06-08 |
| [ADR-017](./017-resource-timing-integration.md) | Resource Timing Integration | Accepted | 2025-06-08 |
| [ADR-018](./018-memory-safe-telemetry-buffering.md) | Memory-Safe Telemetry Buffering | Accepted | 2025-06-08 |

## Overview

These ADRs document the key architectural decisions made in the development of the Angular Telemetry package:

### Foundation & API Design (ADR-001 to ADR-006)
- **Decorator-Based Instrumentation**: Establishes the foundation with TypeScript decorators for clean, declarative telemetry
- **Unified Class Decorator**: Provides namespace management across all telemetry types
- **Type Safety**: Ensures full TypeScript support without compromising type inference
- **Universal Decorator**: Simplifies the API with automatic target detection
- **API Flexibility**: Supports both decorator and service-based approaches

### Core Implementation (ADR-006 to ADR-009)
- **Core Architecture**: Details the dual service implementation, DI patterns, and module structure
- **SSR Architecture**: Addresses platform-specific behavior, state transfer, and server-side optimizations
- **Signal/Effect Tracing**: Implements reactive primitive instrumentation using wrapper functions
- **Performance Optimization**: Avoids Proxy overhead for better runtime performance

### Advanced Features (ADR-010 to ADR-018)
- **RxJS Metric Batching**: Leverages RxJS for sophisticated metric batching with backpressure handling
- **Smart Sampling**: Implements adaptive sampling based on operation frequency and importance
- **Web Vitals**: Integrates Core Web Vitals as first-class telemetry metrics
- **Signal Change Tracking**: Converts signal updates into observable streams for monitoring
- **Effect Loop Detection**: Prevents and detects runaway effect loops using RxJS patterns
- **Context Propagation**: Maintains trace context across async operations with RxJS
- **Request-Scoped Telemetry**: Correlates all telemetry within a single user request
- **Resource Timing**: Integrates browser performance APIs with telemetry
- **Memory Safety**: Prevents memory exhaustion from telemetry buffering

## ADR Format

Each ADR follows this structure:
- **Status**: Current state (Proposed, Accepted, Deprecated, Superseded)
- **Context**: Background and problem statement
- **Decision**: The architectural choice made
- **Consequences**: Positive, negative, and neutral impacts
- **Implementation Details**: Code examples and guidelines
- **References**: Related documentation and resources

## Creating New ADRs

When adding a new ADR:
1. Use the next sequential number (e.g., `009-feature-name.md`)
2. Follow the established format (see [template.md](./template.md))
3. Update this index
4. Link related ADRs where applicable
5. Include code examples when relevant

## Reading Order

For newcomers to the project, we recommend reading the ADRs in this order:

1. Start with [ADR-001](./001-decorator-based-instrumentation.md) to understand the decorator-based approach
2. Read [ADR-006](./006-core-architecture.md) for the overall architecture
3. Review [ADR-005](./005-imperative-declarative-coexistence.md) to understand API flexibility
4. Explore specific topics:
   - For SSR: [ADR-007](./007-ssr-architecture.md)
   - For signals: [ADR-008](./008-signal-effect-tracing.md)
   - For type safety: [ADR-003](./003-type-safe-callbacks.md)
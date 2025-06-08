# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for the Angular Telemetry package.

## Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-001](./001-decorator-based-instrumentation.md) | Decorator-Based Instrumentation | Accepted | 2024-01-15 |
| [ADR-002](./002-unified-telemetry-decorator.md) | Unified @Telemetry Class Decorator | Accepted | 2024-01-16 |
| [ADR-003](./003-type-safe-callbacks.md) | Type-Safe Telemetry Callbacks | Accepted | 2024-01-17 |
| [ADR-004](./004-universal-traced-decorator.md) | Universal @Traced Decorator | Accepted | 2024-01-18 |
| [ADR-005](./005-imperative-declarative-coexistence.md) | Coexistence of Imperative and Declarative APIs | Accepted | 2024-01-19 |
| [ADR-006](./006-core-architecture.md) | Core Architecture of Angular Telemetry Package | Accepted | 2025-01-06 |
| [ADR-007](./007-ssr-architecture.md) | Server-Side Rendering (SSR) Telemetry Architecture | Accepted | 2025-01-06 |
| [ADR-008](./008-signal-effect-tracing.md) | Angular Signal and Effect Tracing Architecture | Accepted | 2025-01-06 |
| [ADR-009](./009-avoiding-proxy-performance-overhead.md) | Avoiding Proxy Performance Overhead in Signal Tracing | Accepted | 2025-01-06 |

## Overview

These ADRs document the key architectural decisions made in the development of the Angular Telemetry package:

### Foundation & API Design (ADR-001 to ADR-005)
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
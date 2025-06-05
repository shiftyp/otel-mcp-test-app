# ADR-002: Unified @Telemetry Class Decorator

## Status
Accepted

## Context
When implementing telemetry across a codebase, maintaining consistent naming conventions is crucial for:
- Organizing telemetry data hierarchically
- Filtering and searching in observability tools
- Understanding the source of telemetry data
- Avoiding naming collisions

Initially, we considered separate decorators like `@TracedClass` for different telemetry types, but this would lead to confusion about which decorator affects which telemetry type.

## Decision
We will use a single `@Telemetry` class decorator that:
1. Establishes a namespace for ALL telemetry types (traces, metrics, logs)
2. Supports hierarchical namespacing (e.g., `ecommerce.cart.service`)
3. Provides configuration that cascades to all telemetry within the class
4. Can be applied to components, services, and any other classes

The decorator will store metadata that is read by all telemetry decorators (`@Traced`, `@Metric`, `@Logged`) to build fully-qualified names.

## Consequences

### Positive
- **Single source of truth**: One decorator defines the namespace for all telemetry
- **Hierarchical organization**: Natural grouping in observability tools
- **Configuration inheritance**: Class-level defaults for sampling, batching, etc.
- **Clear semantics**: `@Telemetry` clearly indicates it affects all telemetry types

### Negative
- **Required coordination**: All telemetry decorators must check for class metadata
- **Potential verbosity**: Fully-qualified names can be long
- **Migration effort**: Existing code needs namespace consideration

## Example
```typescript
@Telemetry({
  namespace: 'ecommerce.payments',
  defaultOptions: {
    traces: { sampleRate: 1.0 },     // Always trace payments
    metrics: { batched: false },      // Never batch payment metrics
    logs: { level: 'info' }          // Detailed payment logs
  }
})
export class PaymentService {
  @Traced()  // Becomes: ecommerce.payments.processPayment
  @Metric()  // Metric: ecommerce.payments.processPayment
  @Logged()  // Logs with context: { namespace: 'ecommerce.payments' }
  processPayment(amount: number) {
    // All telemetry automatically namespaced
  }
}
```
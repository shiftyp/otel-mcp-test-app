# ADR-001: Decorator-Based Instrumentation

## Status
Accepted

## Context
Angular applications need comprehensive telemetry (traces, metrics, logs) but manually instrumenting every method, component, and signal creates significant boilerplate code. The current approach requires developers to explicitly call telemetry methods throughout their code, which:
- Clutters business logic with telemetry concerns
- Is error-prone and easily forgotten
- Makes code harder to read and maintain
- Requires repetitive namespace management

## Decision
We will implement a decorator-based telemetry system that:
1. Uses a single `@Telemetry` class decorator to establish namespace context
2. Provides `@Traced`, `@Metric`, and `@Logged` decorators for automatic instrumentation
3. Leverages TypeScript's type system for full type safety in callbacks
4. Supports both declarative (decorator) and imperative (manual) telemetry

## Consequences

### Positive
- **Clean separation of concerns**: Business logic remains uncluttered
- **Type safety**: Full IntelliSense and compile-time checking for callbacks
- **Consistency**: Standardized telemetry across the application
- **Reduced boilerplate**: Single decorator instead of manual instrumentation
- **Namespace management**: Automatic hierarchical naming from class context
- **Flexibility**: Can combine decorators and still use imperative methods

### Negative
- **Learning curve**: Developers need to understand decorator patterns
- **Runtime overhead**: Minimal performance impact from method wrapping
- **Debugging complexity**: Stack traces include decorator wrappers
- **TypeScript requirement**: Decorators require TypeScript configuration

## Example
```typescript
@Telemetry('shop.cart')
export class CartService {
  @Traced()
  @Metric('items.add', {
    attributes: (args, result) => ({
      'product.id': args[0].id,      // Fully typed
      'cart.size': result.items.length  // Type-safe
    })
  })
  addItem(product: Product): Cart {
    // Pure business logic
  }
}
```
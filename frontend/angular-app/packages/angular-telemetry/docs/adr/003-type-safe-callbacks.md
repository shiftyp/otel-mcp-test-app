# ADR-003: Type-Safe Telemetry Callbacks

## Status
Accepted

## Context
Telemetry decorators often need to extract information from method arguments and return values for attributes, metric values, and conditions. Without proper typing, these callbacks are error-prone and lack IDE support.

Traditional approaches either:
1. Use `any` types, losing all type safety
2. Require manual generic type annotations, which are verbose and error-prone
3. Limit functionality to avoid complex typing

## Decision
We will leverage TypeScript's type inference to automatically provide full type safety for all decorator callbacks:

```typescript
export function Metric<T extends (...args: any[]) => any>(
  metricName?: string,
  options?: MetricOptions<MethodParameters<T>, Awaited<MethodReturn<T>>>
)
```

This approach:
1. Automatically infers parameter types and return type from the decorated method
2. Provides full IntelliSense in callbacks
3. Catches type errors at compile time
4. Handles async methods by unwrapping Promise types

## Consequences

### Positive
- **Zero manual type annotations**: Types are inferred automatically
- **Full IDE support**: Autocomplete, refactoring, and error highlighting
- **Compile-time safety**: Type errors caught before runtime
- **Better developer experience**: No need to remember method signatures
- **Refactoring support**: Rename properties and all usages update

### Negative
- **Complex type definitions**: The decorator implementation uses advanced TypeScript
- **Compilation overhead**: More complex type checking may slow builds slightly
- **TypeScript version requirement**: Requires modern TypeScript features
- **Learning curve**: Advanced types may be intimidating to some developers

## Example
```typescript
class OrderService {
  @Metric('order.create', {
    // TypeScript knows args is [Product[], string] and result is Order
    attributes: (args, result) => ({
      'order.id': result.id,           // ✅ Autocomplete works
      'order.items': args[0].length,   // ✅ Type-safe array access
      'customer.id': args[1]           // ✅ Knows it's a string
    }),
    value: (args, result) => result.total,  // ✅ Knows total is number
    condition: (args, result) => result.status === 'completed'
  })
  async createOrder(items: Product[], customerId: string): Promise<Order> {
    // Implementation
  }
}
```

## Implementation Notes
- Use `MethodParameters<T>` to extract parameter tuple type
- Use `Awaited<MethodReturn<T>>` to handle both sync and async methods
- Use `TypedPropertyDescriptor<T>` to maintain method signature
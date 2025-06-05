# ADR-004: Universal @Traced Decorator

## Status
Accepted

## Context
Initially, we considered separate decorators for different targets:
- `@TracedSignal` for signals
- `@TracedComputed` for computed values  
- `@TracedEffect` for effects
- `@TracedMethod` for methods
- `@TracedComponent` for components

This approach would require developers to:
- Remember which decorator to use for each target
- Import multiple decorators
- Understand the subtle differences between them

## Decision
We will implement a single `@Traced` decorator that automatically detects its target at runtime and applies the appropriate instrumentation. The decorator will:

1. Detect the decoration target (class, method, property)
2. For properties, detect if they're signals, computed, or effects
3. Apply the correct telemetry instrumentation
4. Use the same options interface adapted to each context

## Consequences

### Positive
- **Simpler API**: One decorator to remember
- **Consistent mental model**: Same decorator everywhere
- **Runtime flexibility**: Can adapt to different signal types
- **Cleaner imports**: Single import for all tracing needs
- **Future-proof**: Can handle new target types without new decorators

### Negative
- **Runtime detection overhead**: Small performance cost to detect types
- **Complex implementation**: Single decorator must handle multiple scenarios
- **Potential ambiguity**: May not be immediately clear what will be traced
- **Error messages**: Harder to provide target-specific error messages

## Example
```typescript
@Traced()  // Applied to class - traces lifecycle
@Component({ selector: 'app-cart' })
export class CartComponent {
  @Traced()  // Detects signal and applies signal tracing
  items = signal<Item[]>([]);
  
  @Traced()  // Detects computed and traces recomputation
  total = computed(() => this.calculateTotal());
  
  @Traced()  // Detects effect and traces execution
  persist = effect(() => localStorage.setItem('cart', JSON.stringify(this.items())));
  
  @Traced()  // Detects method and creates spans
  async checkout() {
    // Method automatically wrapped in span
  }
}
```

## Implementation Strategy
```typescript
function isSignal(value: any): boolean {
  return typeof value === 'function' && value.name === 'signal';
}

function isComputed(value: any): boolean {
  return typeof value === 'function' && value.name === 'computed';
}

function isEffect(value: any): boolean {
  return typeof value === 'function' && value.name === 'effect';
}
```
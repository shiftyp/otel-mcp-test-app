# Angular Signal Telemetry Integration

## Overview

This implementation provides automatic OpenTelemetry instrumentation for Angular signals, enabling comprehensive tracking of reactive state changes, computed values, and effects with minimal code changes. Now with enhanced decorator support for even cleaner instrumentation.

## Features

### 1. **Signal Instrumentation**
- Automatic span creation for signal updates
- Track update frequency and duration
- Capture previous and new values
- Monitor signal performance metrics

### 2. **Computed Signal Tracking**
- Measure computation time
- Warn on slow computations
- Track dependency chains
- Monitor recomputation frequency

### 3. **Effect Monitoring**
- Track effect execution duration
- Monitor effect frequency
- Detect slow effects
- Capture effect dependencies

### 4. **Signal Change History**
- Maintain history of signal changes
- Track signal relationships
- Generate performance reports
- Identify performance bottlenecks

## Usage

### Option 1: Decorator-Based Approach (Recommended)

Use the `@Traced` decorator for the cleanest, most maintainable code:

```typescript
import { Component, signal, computed, effect } from '@angular/core';
import { Traced } from '@otel-mcp-test-app/angular-telemetry';

export class MyComponent {
  // Automatically traced signal
  @Traced({ 
    spanName: 'counter-updates',
    attributes: (value: number) => ({ 'counter.value': value })
  })
  counter = signal(0);
  
  // Traced computed with performance monitoring
  @Traced({ 
    spanName: 'doubled-value',
    warnOnSlowComputation: 10 
  })
  doubled = computed(() => this.counter() * 2);
  
  // Traced effect
  constructor() {
    effect(() => {
      console.log('Counter changed:', this.counter());
    });
  }
  
  increment() {
    this.counter.update(v => v + 1);
  }
}
```

### Option 2: Service-Based Approach

For more control or dynamic configuration:

```typescript
import { TelemetryService } from './services/telemetry.service';

export class MyComponent {
  private telemetry = inject(TelemetryService);
  
  // Create a tracked signal
  counter = this.telemetry.signal(0, {
    spanName: 'counter-updates',
    trackerName: 'main-counter',
    attributes: (value) => ({ 'counter.value': value })
  });
  
  increment() {
    this.counter.update(v => v + 1);
  }
}
```

### Computed Signals

#### With Decorators:
```typescript
// Track expensive computations with decorator
@Traced({
  spanName: 'filter-expensive-items',
  warnOnSlowComputation: 10, // Warn if takes > 10ms
  attributes: (items: Item[]) => ({ 'filtered.count': items.length })
})
expensiveItems = computed(() => 
  this.items().filter(item => item.price > 100)
);
```

#### With Service:
```typescript
// Track expensive computations
expensiveComputed = this.telemetry.computed(() => {
  return this.items().filter(item => item.price > 100);
}, {
  spanName: 'filter-expensive-items',
  warnOnSlowComputation: 10, // Warn if takes > 10ms
  attributes: (items) => ({ 'filtered.count': items.length })
});
```

### Effects with Telemetry

#### With Service (Effects require service approach):
```typescript
ngOnInit() {
  // Monitor side effects
  this.telemetry.effect(() => {
    const total = this.cartTotal();
    if (total > 1000) {
      this.notifyHighValueCart();
    }
  }, {
    spanName: 'monitor-cart-value',
    warnOnSlowEffect: 20,
    attributes: { 'effect.type': 'cart-monitor' }
  });
}
```

## Signal Tracking Service

### Performance Reports

```typescript
// Get comprehensive performance report
const report = this.telemetry.getSignalPerformanceReport();

// Report includes:
// - Total signals tracked
// - Average update duration
// - Slowest signals
// - Most frequently updated signals
// - Signal dependency graph
```

### Dependency Tracking

```typescript
// Get all signals affected by a change
const chain = this.telemetry.getSignalDependencies('cart-items');
// Returns: ['cart-items', 'total-items', 'total-price', 'final-price']
```

## Example: Shopping Cart with Full Telemetry

See `cart-with-telemetry.component.ts` for a complete example that demonstrates:

1. **Tracked Signals**: Cart items, discount codes (using decorators)
2. **Computed Values**: Total price, discount percentage, final price
3. **Effects**: High-value cart monitoring
4. **Performance Reporting**: Real-time signal metrics

Navigate to `/cart-telemetry` to see it in action.

### Example with Decorators:
```typescript
@Component({ selector: 'app-cart' })
@Telemetry({ spanName: 'shopping-cart' })
export class CartComponent {
  // Traced signals
  @Traced({ spanName: 'cart-items' })
  items = signal<CartItem[]>([]);
  
  @Traced({ spanName: 'discount-code' })
  discountCode = signal<string>('');
  
  // Traced computed values
  @Traced({ 
    spanName: 'cart-subtotal',
    warnOnSlowComputation: 50 
  })
  subtotal = computed(() => 
    this.items().reduce((sum, item) => sum + item.price * item.quantity, 0)
  );
  
  @Traced({ spanName: 'discount-amount' })
  discount = computed(() => {
    const code = this.discountCode();
    return code === 'SAVE10' ? 0.1 : 0;
  });
  
  @Traced({ 
    spanName: 'cart-total',
    attributes: (total: number) => ({ 'cart.total': total })
  })
  total = computed(() => 
    this.subtotal() * (1 - this.discount())
  );
  
  // Traced methods
  @Traced({ spanName: 'add-to-cart' })
  @Metric({ 
    name: 'cart.items.added',
    attributes: (item: CartItem) => ({ 'item.id': item.id })
  })
  addItem(item: CartItem) {
    this.items.update(items => [...items, item]);
  }
}
```

## Metrics Collected

### Signal Metrics
- `signal.updates` - Counter of signal updates
- `signal.update.duration` - Histogram of update durations
- `computed.duration` - Histogram of computation times
- `effect.duration` - Histogram of effect execution times

### Attributes
- `signal.id` - Unique identifier for the signal
- `signal.type` - Type of signal (writable/computed/effect)
- `signal.has_changed` - Whether the value actually changed
- `computed.slow` - Marks slow computations
- `effect.slow` - Marks slow effects

## Performance Monitoring

### Automatic Warnings
- Slow computations (default: >10ms)
- Slow effects (default: >10ms)
- High-frequency updates
- Deep dependency chains

### Signal Metrics Dashboard
Access real-time metrics:
```typescript
// In component
showMetrics() {
  const report = this.telemetry.getSignalPerformanceReport();
  console.table(report.topUpdatedSignals);
  console.table(report.slowestSignals);
}
```

## Best Practices

1. **Name Your Signals**: Use `trackerName` for easier debugging
2. **Set Appropriate Thresholds**: Adjust `warnOnSlowComputation` based on your needs
3. **Monitor Dependencies**: Keep an eye on dependency chains to avoid cascading updates
4. **Use Computed Signals**: Prefer computed over effects when possible
5. **Batch Updates**: Use `update()` instead of multiple `set()` calls

## Integration with Existing Telemetry

The signal telemetry seamlessly integrates with existing trace context:

### With Decorators:
```typescript
@Traced({ spanName: 'process-order' })
async processOrder() {
  // Signal updates are automatically linked to this span
  this.orderStatus.set('processing');
  this.orderItems.update(items => processItems(items));
  
  // The signal spans will be children of 'process-order'
}
```

### With Service:
```typescript
this.telemetry.withSpan('process-order', (span) => {
  // Signal updates within this span are automatically linked
  this.orderStatus.set('processing');
  this.orderItems.update(items => processItems(items));
  
  // The signal spans will be children of 'process-order'
});
```

## Choosing Between Decorators and Service

### Use Decorators When:
- You want clean, declarative code
- Telemetry configuration is mostly static
- You're instrumenting class properties and methods
- You prefer separation of concerns

### Use Service When:
- You need dynamic telemetry configuration
- You're creating signals conditionally
- You need fine-grained control over spans
- You're working with effects (currently service-only)

### Combine Both Approaches:
```typescript
@Component({ selector: 'app-hybrid' })
@Telemetry({ spanName: 'hybrid-component' })
export class HybridComponent {
  private telemetry = inject(TelemetryService);
  
  // Use decorator for simple cases
  @Traced({ spanName: 'user-preference' })
  theme = signal<'light' | 'dark'>('light');
  
  // Use service for dynamic configuration
  dynamicSignal = this.telemetry.signal(
    initialValue,
    {
      spanName: `dynamic-${this.config.type}`,
      sampleRate: this.config.debugMode ? 1.0 : 0.1
    }
  );
}
```

## Debugging

Enable OpenTelemetry diagnostics:
```bash
OTEL_DEBUG=true npm start
```

View signal metrics in browser console:
```javascript
// Get all signal metrics
const metrics = window.__SIGNAL_METRICS__;
```

## Future Enhancements

- Automatic dependency detection
- Signal value diffing
- Replay signal history
- Chrome DevTools extension
- Real-time signal graph visualization
- Enhanced decorator support for effects
- Decorator-based sampling configuration
- Compile-time telemetry optimization
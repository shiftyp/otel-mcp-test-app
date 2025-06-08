# @otel-mcp-test-app/angular-telemetry

OpenTelemetry instrumentation for Angular applications with built-in support for Angular Signals, providing automatic tracing, metrics, and observability for modern Angular apps.

## Features

- 🚀 **Angular Signal Support** - Automatic telemetry for `signal()`, `computed()`, and `effect()`
- 📊 **Built-in Metrics** - Track signal reads/writes, computation times, and effect executions
- 🔍 **Distributed Tracing** - Full OpenTelemetry tracing support with W3C Trace Context
- 🎯 **Smart Sampling** - Configurable sampling rates with intelligent sampling for important operations
- 🌐 **SSR Support** - Works seamlessly with Angular Universal server-side rendering
- ⚡ **Performance Monitoring** - Web Vitals integration and performance metrics
- 🛠️ **Flexible Configuration** - Extensive configuration options for different environments
- 🎨 **Decorator Support** - Clean, declarative telemetry with `@Telemetry`, `@Traced`, `@Metric`, and `@Logged` decorators
- 🔄 **Dual API** - Choose between decorator-based or service-based approaches

## Installation

```bash
npm install @otel-mcp-test-app/angular-telemetry
```

## Quick Start

### 1. Initialize Browser Telemetry

In your `main.ts`:

```typescript
import { initializeBrowserTelemetry } from '@otel-mcp-test-app/angular-telemetry';

// Initialize OpenTelemetry
initializeBrowserTelemetry({
  serviceName: 'my-angular-app',
  serviceVersion: '1.0.0',
  environment: 'production',
  collectorUrl: 'http://localhost:4318', // Your OTLP collector endpoint
  enableAutoInstrumentation: true,
  enableMetrics: true
});

// Bootstrap your app
bootstrapApplication(AppComponent, appConfig);
```

### 2. Choose Your Approach: Decorators or Service

#### Option A: Decorator-Based Approach (Recommended)

Use decorators for clean, declarative telemetry that separates instrumentation from business logic:

```typescript
import { Injectable, signal, computed, effect } from '@angular/core';
import { Telemetry, Traced, Metric, Logged } from '@otel-mcp-test-app/angular-telemetry';

@Injectable({
  providedIn: 'root'
})
@Telemetry({
  spanName: 'user-service',
  metrics: {
    'users.active': 'counter',
    'api.latency': 'histogram'
  }
})
export class UserService {
  // Automatically traced signal
  @Traced({ spanName: 'current-user' })
  currentUser = signal<User | null>(null);

  // Traced computed with performance monitoring
  @Traced({ 
    spanName: 'user-permissions',
    warnOnSlowComputation: 50 
  })
  permissions = computed(() => {
    const user = this.currentUser();
    return user ? this.calculatePermissions(user) : [];
  });

  // Traced method with custom attributes
  @Traced({
    spanName: 'login',
    attributes: (email: string) => ({ 'user.email': email })
  })
  async login(email: string, password: string): Promise<User> {
    const user = await this.authApi.login(email, password);
    this.currentUser.set(user);
    return user;
  }

  // Method with metric recording
  @Metric({
    name: 'checkout.completed',
    value: 1,
    attributes: (orderId: string, total: number) => ({
      'order.id': orderId,
      'order.total': total
    })
  })
  async completeCheckout(orderId: string, total: number): Promise<void> {
    // Business logic here
  }

  // Method with structured logging
  @Logged({
    level: 'info',
    message: 'User action performed',
    attributes: (action: string) => ({ action })
  })
  performAction(action: string): void {
    // Business logic here
  }
}
```

#### Option B: Service-Based Approach

For more control or when decorators aren't suitable:

```typescript
import { Injectable, inject } from '@angular/core';
import { DefaultTelemetryService } from '@otel-mcp-test-app/angular-telemetry';

@Injectable({
  providedIn: 'root'
})
export class MyService {
  private telemetry = inject(DefaultTelemetryService);

  // Create traced signals
  counter = this.telemetry.createTracedSignal(0, 'counter', {
    attributes: (value) => ({ 'counter.value': value })
  });

  // Create traced computed values
  doubled = this.telemetry.createTracedComputed(
    () => this.counter() * 2,
    'doubled-value',
    {
      warnOnSlowComputation: 10 // Warn if computation takes > 10ms
    }
  );

  // Create traced effects
  constructor() {
    this.telemetry.createTracedEffect(
      () => {
        console.log('Counter changed:', this.counter());
      },
      'counter-logger',
      {
        attributes: { 'effect.type': 'logging' }
      }
    );
  }

  // Business operations with tracing
  async processOrder(orderId: string) {
    return this.telemetry.withSpan('process-order', async () => {
      // Your business logic here
      this.telemetry.recordMetric('orders.processed', 1, {
        'order.id': orderId
      });
    }, {
      'order.id': orderId
    });
  }
}
```

## Decorator API Reference

### `@Telemetry(options)`
Class decorator that provides telemetry context for all methods and properties.

```typescript
@Telemetry({
  spanName: 'service-name',           // Base span name for the service
  attributes: { 'service.type': 'api' }, // Static attributes
  metrics: {                          // Metrics to initialize
    'requests.total': 'counter',
    'response.time': 'histogram'
  }
})
export class MyService { }
```

### `@Traced(options)`
Decorator for methods, signals, computed, and effects with automatic tracing.

```typescript
// Method tracing
@Traced({
  spanName: 'fetch-data',
  attributes: (id: string) => ({ 'item.id': id }),
  recordDuration: true              // Record duration as metric
})
async fetchData(id: string) { }

// Signal tracing
@Traced({ spanName: 'user-state' })
userState = signal<UserState>(initialState);

// Computed tracing
@Traced({ 
  spanName: 'calculated-total',
  warnOnSlowComputation: 100        // Warn if > 100ms
})
total = computed(() => this.calculateTotal());
```

### `@Metric(options)`
Records metrics when the decorated method is called.

```typescript
@Metric({
  name: 'api.calls',
  value: 1,                         // or (result) => result.length
  type: 'counter',                  // counter, histogram, gauge
  attributes: (userId: string) => ({ 'user.id': userId })
})
async fetchUserData(userId: string) { }
```

### `@Logged(options)`
Adds structured logging to methods.

```typescript
@Logged({
  level: 'info',                    // info, warn, error, debug
  message: 'Operation completed',
  attributes: (id: string, result: any) => ({
    'operation.id': id,
    'result.size': result.length
  })
})
processData(id: string): any[] { }
```

## Service API Reference

### Service Methods

#### `createTracedSignal<T>(initialValue, name, options?)`
Creates a signal with automatic telemetry for reads and writes.

```typescript
const user = telemetry.createTracedSignal(null, 'current-user', {
  sampleRate: 0.1,              // Sample 10% of operations
  recordMetrics: true,          // Record metrics for operations
  attributes: (user) => ({      // Dynamic attributes based on value
    'user.id': user?.id,
    'user.role': user?.role
  })
});
```

#### `createTracedComputed<T>(computation, name, options?)`
Creates a computed signal with performance tracking.

```typescript
const totalPrice = telemetry.createTracedComputed(
  () => items().reduce((sum, item) => sum + item.price, 0),
  'cart-total',
  {
    warnOnSlowComputation: 50,  // Warn if computation > 50ms
    attributes: (total) => ({
      'cart.total': total,
      'cart.items': items().length
    })
  }
);
```

#### `createTracedEffect(effectFn, name, options?)`
Creates an effect with execution tracking.

```typescript
telemetry.createTracedEffect(
  () => {
    // Side effect logic
  },
  'data-sync',
  {
    warnOnSlowEffect: 100,      // Warn if effect > 100ms
    attributes: {
      'effect.purpose': 'synchronization'
    }
  }
);
```

#### `withSpan<T>(name, fn, attributes?)`
Wraps any operation in a trace span.

```typescript
const result = await telemetry.withSpan('api-call', async () => {
  return await fetch('/api/data');
}, {
  'api.endpoint': '/api/data',
  'api.method': 'GET'
});
```

#### `recordMetric(name, value, attributes?)`
Records a custom metric.

```typescript
telemetry.recordMetric('checkout.completed', 1, {
  'payment.method': 'credit_card',
  'order.total': 99.99
});
```

### Configuration Options

#### `BrowserTelemetryConfig`

```typescript
interface BrowserTelemetryConfig {
  serviceName: string;          // Your application name
  serviceVersion: string;       // Application version
  environment?: string;         // 'development' | 'production'
  collectorUrl?: string;        // OTLP collector endpoint
  enableAutoInstrumentation?: boolean; // Auto-instrument fetch, XHR, etc.
  enableMetrics?: boolean;      // Enable metrics collection
}
```

#### `SignalTelemetryOptions`

```typescript
interface SignalTelemetryOptions<T> {
  spanName?: string;            // Custom span name
  trackerName?: string;         // Identifier for metrics
  sampleRate?: number;          // 0.0 to 1.0
  recordMetrics?: boolean;      // Enable metrics
  skipInitialValue?: boolean;   // Skip tracing initial value
  attributes?: (value: T) => Record<string, any>; // Dynamic attributes
}
```

### Benefits of Decorator Approach

1. **Separation of Concerns**: Telemetry configuration is separate from business logic
2. **Cleaner Code**: No need to wrap operations in `withSpan` calls
3. **Type Safety**: Full TypeScript support with type inference
4. **Composability**: Stack multiple decorators for combined functionality
5. **Testability**: Easy to mock or disable telemetry in tests
6. **Consistency**: Uniform approach across your application

## Using Both Approaches Together

You can mix decorator and service approaches in the same application:

```typescript
@Injectable()
@Telemetry({ spanName: 'hybrid-service' })
export class HybridService {
  private telemetry = inject(DefaultTelemetryService);
  
  // Use decorator for simple cases
  @Traced({ spanName: 'simple-operation' })
  simpleOperation() {
    return 'done';
  }
  
  // Use service for complex scenarios
  complexOperation() {
    return this.telemetry.withSpan('complex-operation', async (span) => {
      span.setAttribute('step', 'initialization');
      // Complex logic with multiple span updates
      span.setAttribute('step', 'processing');
      // More logic
      span.setAttribute('step', 'completion');
    });
  }
}
```

## Advanced Usage

### Using ConfigurableTelemetryService

For advanced scenarios, use the configurable service:

```typescript
import { ConfigurableTelemetryService } from '@otel-mcp-test-app/angular-telemetry';

// In your app config
providers: [
  {
    provide: 'TELEMETRY_CONFIG',
    useValue: {
      enableStateTransfer: true,        // SSR state transfer
      enableWebVitals: true,           // Web Vitals monitoring
      enableSmartSampling: true,       // Intelligent sampling
      enableEffectLoopDetection: true, // Detect effect loops
      enableBatchedMetrics: true,      // Batch metric exports
      defaultSampleRate: 0.1,
      serverSampleRateMultiplier: 0.1,
      metricsFlushInterval: 5000,
      slowComputationThreshold: 100,
      slowEffectThreshold: 100
    }
  },
  {
    provide: DefaultTelemetryService,
    useClass: ConfigurableTelemetryService
  }
]
```

### Server-Side Rendering (SSR)

For SSR applications, initialize server telemetry in your server setup:

```typescript
// In your server.ts or instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  serviceName: 'my-app-ssr',
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces'
  })
});

sdk.start();
```

### Business Metrics

Create custom business metrics:

```typescript
import { BusinessMetrics } from '@otel-mcp-test-app/angular-telemetry';

const metrics = new BusinessMetrics('e-commerce');

// Track conversions
metrics.recordConversion('checkout', {
  'payment.method': 'paypal',
  'cart.value': 150.00
});

// Track latency
const stopTimer = metrics.startTimer('api.latency');
// ... perform operation ...
stopTimer({ 'api.endpoint': '/products' });
```

### Performance Monitoring

Monitor Web Vitals (automatically enabled with `enableWebVitals`):

```typescript
// Metrics automatically collected:
// - web_vitals_cls (Cumulative Layout Shift)
// - web_vitals_fid (First Input Delay)
// - web_vitals_fcp (First Contentful Paint)
// - web_vitals_lcp (Largest Contentful Paint)
// - web_vitals_ttfb (Time to First Byte)
```

## Best Practices

### Decorator Best Practices

1. **Use Class-Level @Telemetry**: Apply to services for consistent naming
   ```typescript
   @Telemetry({ spanName: 'user-service' })
   export class UserService { }
   ```

2. **Combine Decorators**: Stack decorators for comprehensive instrumentation
   ```typescript
   @Traced({ spanName: 'create-order' })
   @Metric({ name: 'orders.created', value: 1 })
   @Logged({ level: 'info', message: 'Order created' })
   async createOrder(data: OrderData) { }
   ```

3. **Dynamic Attributes**: Use callback functions for runtime values
   ```typescript
   @Traced({
     attributes: (user: User) => ({
       'user.id': user.id,
       'user.role': user.role,
       'user.premium': user.isPremium
     })
   })
   processUser(user: User) { }
   ```

4. **Performance Monitoring**: Set appropriate thresholds
   ```typescript
   @Traced({ warnOnSlowComputation: 50 }) // Component computations
   @Traced({ warnOnSlowComputation: 200 }) // Heavy calculations
   ```

### General Best Practices

1. **Signal Naming**: Use descriptive names for signals to make traces easier to understand
   ```typescript
   // Good
   this.telemetry.createTracedSignal([], 'shopping-cart-items');
   
   // Avoid
   this.telemetry.createTracedSignal([], 'items');
   ```

2. **Sampling Rates**: Use appropriate sampling rates to balance observability and performance
   ```typescript
   // High-frequency operations: lower sample rate
   createTracedSignal(value, 'mouse-position', { sampleRate: 0.01 });
   
   // Critical operations: higher sample rate
   createTracedSignal(value, 'user-authentication', { sampleRate: 1.0 });
   ```

3. **Attributes**: Add meaningful attributes to help with debugging
   ```typescript
   createTracedSignal(user, 'current-user', {
     attributes: (u) => ({
       'user.id': u?.id,
       'user.authenticated': !!u,
       'user.role': u?.role || 'anonymous'
     })
   });
   ```

4. **Performance Warnings**: Set appropriate thresholds for your use case
   ```typescript
   createTracedComputed(() => expensiveCalculation(), 'analytics', {
     warnOnSlowComputation: 100 // Adjust based on expected performance
   });
   ```

## Troubleshooting

### Traces not appearing in collector

1. Verify the collector URL is correct
2. Check browser console for OTLP export errors
3. Ensure CORS is properly configured on your collector

### High memory usage

1. Reduce sampling rates for high-frequency operations
2. Enable batched metrics with `enableBatchedMetrics`
3. Adjust `metricsFlushInterval` to flush metrics more frequently

### SSR hydration issues

Enable state transfer in the configurable service:
```typescript
{
  provide: 'TELEMETRY_CONFIG',
  useValue: {
    enableStateTransfer: true
  }
}
```

## Architecture Decision Records

Detailed architectural decisions are documented in the [ADR directory](./docs/adr/). Key ADRs include:

- [ADR-001: Decorator-Based Instrumentation](./docs/adr/001-decorator-based-instrumentation.md) - Foundation decorator approach
- [ADR-006: Core Architecture](./docs/adr/006-core-architecture.md) - Service patterns and module structure
- [ADR-007: SSR Architecture](./docs/adr/007-ssr-architecture.md) - Server-side rendering support
- [ADR-008: Signal and Effect Tracing](./docs/adr/008-signal-effect-tracing.md) - Reactive primitive instrumentation

See the [full ADR index](./docs/adr/) for all architectural decisions.

## License

MIT

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.
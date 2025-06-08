# ADR-001: Core Architecture of Angular Telemetry Package

## Status
Accepted

## Context
The Angular application requires comprehensive telemetry instrumentation to monitor performance, track user interactions, and debug issues in production. The solution needs to integrate seamlessly with Angular's reactive primitives (signals, computed, effects) while supporting both client-side and server-side rendering scenarios.

## Decision
We will implement a service-based telemetry architecture with the following core components:

### 1. Dual Service Implementation Pattern
- **DefaultTelemetryService**: Basic telemetry features for simple use cases
- **ConfigurableTelemetryService**: Advanced features with fine-grained control

### 2. Telemetry Interface Contract
```typescript
interface TelemetryService {
  trace<T>(name: string, fn: () => T, options?: TraceOptions): T;
  log(message: string, attributes?: Record<string, any>): void;
  recordMetric(name: string, value: number, attributes?: Record<string, any>): void;
  recordBusinessMetric(name: string, value: number, attributes?: Record<string, any>): void;
  
  // Angular Signal Support
  signal<T>(initialValue: T, options?: TracedSignalOptions<T>): WritableSignal<T>;
  computed<T>(computation: () => T, options?: TracedComputedOptions<T>): Signal<T>;
  effect(effectFn: () => void, options?: TracedEffectOptions): EffectRef;
}
```

### 3. Module Architecture
- **TelemetryModule**: Angular module with `forRoot()` configuration
- **Token-based DI**: `TELEMETRY_SERVICE` injection token for flexibility
- **Provider Configuration**: Support for both class and value providers

### 4. Initialization Strategy
- **Browser Initialization**: `initializeBrowserTelemetry()` for non-Angular contexts
- **Angular Integration**: Automatic initialization through module import
- **Lazy Loading**: On-demand loading of advanced features

### 5. Feature Flags
```typescript
interface TelemetryConfig {
  enableTracing?: boolean;
  enableMetrics?: boolean;
  enableLogging?: boolean;
  enableWebVitals?: boolean;
  enableSmartSampling?: boolean;
  enableEffectLoopDetection?: boolean;
  enableRequestContext?: boolean;
  enableBatchedMetrics?: boolean;
}
```

## Consequences

### Positive
- **Flexibility**: Supports both simple and advanced use cases
- **Performance**: Feature flags prevent loading unnecessary code
- **Integration**: Seamless Angular integration with DI
- **Extensibility**: Easy to add new telemetry backends
- **Type Safety**: Full TypeScript support with generics

### Negative
- **Complexity**: Two service implementations to maintain
- **Bundle Size**: Advanced features increase size even if unused
- **Learning Curve**: Developers need to choose between implementations

### Neutral
- **Migration Path**: Clear upgrade path from basic to advanced features
- **Testing**: Each service requires separate test suites
- **Documentation**: Requires clear guidance on when to use each service

## Implementation Details

### Service Registration
```typescript
// Basic setup
imports: [TelemetryModule]

// Advanced setup with configuration
imports: [
  TelemetryModule.forRoot({
    config: {
      enableWebVitals: true,
      enableSmartSampling: true,
      samplingRate: 0.1
    }
  })
]
```

### Proxy-based Signal Interception
The implementation uses JavaScript Proxy to intercept signal operations:
```typescript
new Proxy(angularSignal, {
  get(target, prop) {
    if (prop === 'set' || prop === 'update') {
      return new Proxy(target[prop], {
        apply: (fn, thisArg, args) => {
          // Telemetry logic here
          return fn.apply(thisArg, args);
        }
      });
    }
    return target[prop];
  }
});
```

## References
- [OpenTelemetry JavaScript](https://opentelemetry.io/docs/languages/js/)
- [Angular Signals RFC](https://github.com/angular/angular/discussions/49685)
- [Web Vitals](https://web.dev/vitals/)
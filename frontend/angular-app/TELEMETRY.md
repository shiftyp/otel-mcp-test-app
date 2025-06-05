# Frontend Telemetry Configuration

## Overview

The Angular frontend now has comprehensive telemetry collection for both SSR (Server-Side Rendering) and CSR (Client-Side Rendering) modes, supporting:
- Distributed tracing
- Metrics collection
- Structured logging
- Decorator-based instrumentation
- Signal-aware telemetry

## Features

### 1. Unified Configuration
- Separate telemetry initialization for browser and server environments
- Automatic environment detection
- Support for both HTTP and gRPC protocols (SSR only)

### 2. Traces
- Automatic HTTP request tracing via interceptor
- Manual span creation for custom operations
- W3C Trace Context propagation
- Baggage propagation
- Decorator-based tracing with `@Traced`
- Signal, computed, and effect tracing

### 3. Metrics
- Page view tracking
- API call duration and status
- User action tracking
- Shopping cart metrics
- Search query metrics
- Web Vitals (LCP, FID, CLS) - browser only
- Process metrics (memory, CPU, event loop) - SSR only
- Decorator-based metrics with `@Metric`
- Signal operation metrics

### 4. Logs
- Structured logging with severity levels
- Automatic error tracking
- Browser error and unhandled rejection capture
- Server uncaught exception handling
- Decorator-based logging with `@Logged`

### 5. Decorator Support
- `@Telemetry` - Class-level telemetry configuration
- `@Traced` - Method and signal tracing
- `@Metric` - Automatic metric recording
- `@Logged` - Structured logging

## Configuration

### Environment Variables (SSR)
```bash
# Use gRPC protocol for SSR (optional, defaults to HTTP)
OTEL_EXPORTER_OTLP_PROTOCOL=grpc

# Custom collector endpoint (optional)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Production environment
NODE_ENV=production
```

### Browser Configuration
Edit `src/environments/environment.ts`:
```typescript
export const environment = {
  production: false,
  otelCollectorUrl: 'http://localhost:4318'
};
```

## Usage

### Option 1: Decorator-Based Approach (Recommended)

#### Configure Service with Decorators
```typescript
import { Telemetry, Traced, Metric, Logged } from '@otel-mcp-test-app/angular-telemetry';

@Injectable()
@Telemetry({
  spanName: 'product-service',
  metrics: {
    'products.viewed': 'counter',
    'api.latency': 'histogram'
  }
})
export class ProductService {
  // Traced signal
  @Traced({ spanName: 'selected-product' })
  selectedProduct = signal<Product | null>(null);

  // Traced method
  @Traced({ 
    spanName: 'load-products',
    attributes: (category: string) => ({ category })
  })
  @Metric({ 
    name: 'products.loaded',
    value: (products: Product[]) => products.length 
  })
  async loadProducts(category: string): Promise<Product[]> {
    return await this.api.getProducts(category);
  }

  // Logged method
  @Logged({ 
    level: 'info',
    message: 'Product viewed',
    attributes: (id: string) => ({ productId: id })
  })
  viewProduct(id: string): void {
    // Business logic
  }
}
```

### Option 2: Service-Based Approach

#### Inject TelemetryService
```typescript
constructor(private telemetryService: TelemetryService) {}
```

#### Record Page Views
```typescript
ngOnInit() {
  this.telemetryService.recordPageView('product-list');
}
```

#### Create Custom Spans
```typescript
this.telemetryService.withSpan('operation-name', (span) => {
  span.setAttribute('key', 'value');
  // Your code here
});
```

#### Record Metrics
```typescript
// User actions
this.telemetryService.recordUserAction('button-click', 'ui');

// Cart actions
this.telemetryService.recordCartAction('add', productId, quantity, price);

// Search queries
this.telemetryService.recordSearchQuery(query, resultCount);
```

#### Structured Logging
```typescript
// Info log
this.telemetryService.log('User logged in', { userId: '123' });

// Error log
this.telemetryService.logError('Failed to load products', error);

// Warning log
this.telemetryService.logWarning('Low inventory', { productId: '456' });
```

## Testing

### Local Development
1. Ensure OpenTelemetry Collector is running at `http://localhost:4318`
2. Start the dev server: `npm start`
3. Check browser console for "Browser telemetry initialized"
4. View traces in Jaeger UI

### SSR Testing
1. Build for SSR: `npm run build:ssr`
2. Run SSR server: `npm run serve:ssr`
3. Check server console for "Server telemetry initialized"
4. Verify both server and client spans appear in traces

### Verify gRPC (SSR only)
```bash
OTEL_EXPORTER_OTLP_PROTOCOL=grpc npm run serve:ssr
```
Look for "Server telemetry initialized with gRPC protocol" in logs.

## Decorator Examples

### Complete Component Example
```typescript
import { Component, signal, computed } from '@angular/core';
import { Telemetry, Traced, Metric } from '@otel-mcp-test-app/angular-telemetry';

@Component({
  selector: 'app-dashboard',
  template: `...`
})
@Telemetry({ spanName: 'dashboard-component' })
export class DashboardComponent {
  // Traced signals
  @Traced({ spanName: 'user-data' })
  userData = signal<UserData | null>(null);
  
  @Traced({ spanName: 'notifications' })
  notifications = signal<Notification[]>([]);
  
  // Traced computed
  @Traced({ 
    spanName: 'unread-count',
    warnOnSlowComputation: 50 
  })
  unreadCount = computed(() => 
    this.notifications().filter(n => !n.read).length
  );
  
  @Traced({ spanName: 'load-dashboard' })
  @Metric({ 
    name: 'dashboard.loaded',
    value: 1 
  })
  async ngOnInit() {
    await Promise.all([
      this.loadUserData(),
      this.loadNotifications()
    ]);
  }
  
  @Traced({ spanName: 'mark-as-read' })
  @Metric({ 
    name: 'notifications.marked_read',
    attributes: (id: string) => ({ notificationId: id })
  })
  markAsRead(id: string) {
    this.notifications.update(list => 
      list.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }
}
```

### Service with Mixed Approaches
```typescript
@Injectable()
@Telemetry({ spanName: 'auth-service' })
export class AuthService {
  private telemetry = inject(TelemetryService);
  
  // Decorator approach for simple operations
  @Traced({ spanName: 'check-auth' })
  @Metric({ name: 'auth.checks', value: 1 })
  isAuthenticated(): boolean {
    return !!this.token;
  }
  
  // Service approach for complex operations
  async login(credentials: Credentials) {
    return this.telemetry.withSpan('login', async (span) => {
      span.setAttribute('auth.method', credentials.method);
      
      try {
        const result = await this.api.authenticate(credentials);
        span.setAttribute('auth.success', true);
        this.telemetry.recordMetric('auth.success', 1);
        return result;
      } catch (error) {
        span.setAttribute('auth.success', false);
        span.recordException(error);
        this.telemetry.recordMetric('auth.failure', 1);
        throw error;
      }
    });
  }
}
```
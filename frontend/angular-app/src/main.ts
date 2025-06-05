import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { initializeBrowserTelemetry } from 'angular-telemetry';
import { environment } from './environments/environment';

// Initialize OpenTelemetry for browser
initializeBrowserTelemetry({
  serviceName: 'ecommerce-frontend',
  serviceVersion: '1.0.0',
  environment: environment.production ? 'production' : 'development',
  collectorUrl: environment.otelCollectorUrl || 'http://localhost:4318',
  enableAutoInstrumentation: true,
  enableMetrics: true
});

// Bootstrap with zoneless change detection
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
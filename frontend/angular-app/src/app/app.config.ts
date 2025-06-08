import { ApplicationConfig, provideZonelessChangeDetection, ErrorHandler } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';

import { routes } from './app.routes';
import { tracingInterceptor } from './interceptors/tracing.interceptor';
import { authInterceptor } from './interceptors/auth.interceptor';
import { errorInterceptor } from './interceptors/error.interceptor';
import { GlobalErrorHandler } from './services/global-error-handler.service';
import { provideEnvironment } from './providers/environment.provider';

export const appConfig: ApplicationConfig = {
  providers: [
    // Enable zoneless change detection
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(
      withFetch(),
      withInterceptors([
        tracingInterceptor,
        authInterceptor,
        errorInterceptor
      ])
    ),
    provideAnimations(),
    // Global error handler for telemetry
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    // Environment provider
    provideEnvironment()
  ]
};
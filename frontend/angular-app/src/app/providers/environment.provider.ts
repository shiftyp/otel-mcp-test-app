import { InjectionToken, inject } from '@angular/core';
import { environment as defaultEnvironment } from '../../environments/environment';

export interface Environment {
  production: boolean;
  apiUrl: string;
  userApiUrl: string;
  productApiUrl: string;
  cartApiUrl: string;
  otelCollectorUrl: string;
  flagdUrl: string;
}

export const ENVIRONMENT = new InjectionToken<Environment>('environment');

export function provideEnvironment() {
  return { provide: ENVIRONMENT, useValue: defaultEnvironment };
}

export function injectEnvironment(): Environment {
  return inject(ENVIRONMENT, { optional: true }) || defaultEnvironment;
}
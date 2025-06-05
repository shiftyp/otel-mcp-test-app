import { InjectionToken } from '@angular/core';
import { ITelemetryService } from './telemetry.interface';

export const TELEMETRY_SERVICE = new InjectionToken<ITelemetryService>('TelemetryService');
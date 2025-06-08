import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { appConfig } from './app.config';
import { ENVIRONMENT } from './providers/environment.provider';
import { environment } from '../environments/environment.server';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    { provide: ENVIRONMENT, useValue: environment }
  ]
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
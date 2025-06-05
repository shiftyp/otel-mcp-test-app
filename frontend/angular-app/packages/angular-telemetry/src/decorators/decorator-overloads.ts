/**
 * Helper types for decorator overloads
 */

import { TracedOptions, MetricOptions, LoggedOptions } from './types';
import { MethodArgs, UnwrappedReturnType } from './type-inference';

/**
 * Traced decorator overloads
 */
export interface TracedDecorator {
  // Class-based inference overload
  <T, K extends keyof T>(
    options?: TracedOptions<MethodArgs<T, K>, UnwrappedReturnType<T, K>> | string
  ): MethodDecorator;
  
  // Legacy array-based overload
  <TArgs extends any[], TReturn>(
    options?: TracedOptions<TArgs, TReturn> | string
  ): MethodDecorator;
  
  // No type parameters
  (options?: TracedOptions<any, any> | string): MethodDecorator;
}

/**
 * Metric decorator overloads
 */
export interface MetricDecorator {
  // Class-based inference overload
  <T, K extends keyof T>(
    metricName?: string,
    options?: MetricOptions<MethodArgs<T, K>, UnwrappedReturnType<T, K>>
  ): MethodDecorator;
  
  // Legacy array-based overload
  <TArgs extends any[], TReturn>(
    metricName?: string,
    options?: MetricOptions<TArgs, TReturn>
  ): MethodDecorator;
  
  // No type parameters
  (
    metricName?: string,
    options?: MetricOptions<any, any>
  ): MethodDecorator;
}

/**
 * Logged decorator overloads
 */
export interface LoggedDecorator {
  // Class-based inference overload
  <T, K extends keyof T>(
    optionsOrMessage?: LoggedOptions<MethodArgs<T, K>, UnwrappedReturnType<T, K>> | string
  ): MethodDecorator;
  
  // Legacy array-based overload
  <TArgs extends any[], TReturn>(
    optionsOrMessage?: LoggedOptions<TArgs, TReturn> | string
  ): MethodDecorator;
  
  // No type parameters
  (optionsOrMessage?: LoggedOptions<any, any> | string): MethodDecorator;
}
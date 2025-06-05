import { getTelemetryContext } from './telemetry.decorator';
import { LoggedOptions } from './types';
import { MethodArgs, UnwrappedReturnType, UnwrapPromise } from './type-inference';

/**
 * Decorator that automatically logs method entry, exit, and errors.
 * 
 * @example
 * ```typescript
 * @Logged({
 *   level: 'info',
 *   includeArgs: true,
 *   includeResult: true
 * })
 * async processOrder(orderId: string, items: Item[]): Promise<Order> {
 *   // Method implementation
 * }
 * ```
 * 
 * @example With explicit type parameters:
 * ```typescript
 * @Logged<[string, Item[]], Order>({
 *   includeArgs: ([orderId, items]) => ({
 *     orderId,  // TypeScript knows this is string
 *     itemCount: items.length  // TypeScript knows items is Item[]
 *   }),
 *   includeResult: (result) => ({
 *     orderTotal: result.total  // TypeScript knows result is Order
 *   })
 * })
 * async processOrder(orderId: string, items: Item[]): Promise<Order> {
 *   // Method implementation
 * }
 * ```
 */

// Overload for no type parameters
export function Logged(
  optionsOrMessage?: LoggedOptions<any[], any> | string
): MethodDecorator;

// Overload for explicit array types
export function Logged<TArgs extends any[], TReturn>(
  optionsOrMessage?: LoggedOptions<TArgs, UnwrapPromise<TReturn>> | string
): MethodDecorator;

// Overload for class-based type inference
export function Logged<T extends object, K extends keyof T>(
  optionsOrMessage?: LoggedOptions<MethodArgs<T, K>, UnwrappedReturnType<T, K>> | string
): MethodDecorator;

// Implementation
export function Logged(
  optionsOrMessage?: LoggedOptions<any[], any> | string
): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    if (!descriptor || typeof descriptor.value !== 'function') {
      throw new Error('@Logged can only be applied to methods');
    }
    
    const originalMethod = descriptor.value;
    const context = getTelemetryContext(target, String(propertyKey));
    const methodName = context.fullName || String(propertyKey);
    
    // Handle string parameter for simple logging
    const options = typeof optionsOrMessage === 'string' 
      ? { message: optionsOrMessage, logEntry: true, logExit: true }
      : optionsOrMessage;
    
    const logLevel = options?.level || 'info';
    
    descriptor.value = function(this: any, ...args: any[]) {
      const telemetryService = (this as any)['telemetryService'] || (this as any)['_telemetryService'];
      
      if (!telemetryService?.log) {
        return originalMethod.apply(this, args);
      }
      
      const startTime = Date.now();
      const logContext: Record<string, any> = {
        method: methodName,
        namespace: context.namespace
      };
      
      // Add arguments to context if requested
      if (options?.includeArgs) {
        if (typeof options.includeArgs === 'function') {
          logContext['args'] = options.includeArgs(args);
        } else if (Array.isArray(options.includeArgs)) {
          // Only include specified argument indices
          logContext['args'] = options.includeArgs.reduce((acc, index) => {
            if (typeof index === 'string') {
              acc[index] = args[0]?.[index]; // Assume first arg is object
            } else {
              acc[index] = args[index];
            }
            return acc;
          }, {} as any);
        } else {
          logContext['args'] = args;
        }
      }
      
      // Log method entry
      if (options?.logEntry) {
        const entryMessage = options.message 
          ? (typeof options.message === 'function' ? options.message(args) : options.message)
          : `Entering ${methodName}`;
        
        telemetryService.log(entryMessage, logContext, 'debug');
      }
      
      const logCompletion = (result: any, error?: Error) => {
        const duration = Date.now() - startTime;
        const completionContext = {
          ...logContext,
          duration,
          ...(error && { error: error.message, stack: error.stack })
        };
        
        // Add result to context if requested
        if (!error && options?.includeResult) {
          if (typeof options.includeResult === 'function') {
            (completionContext as any)['result'] = options.includeResult(result);
          } else {
            (completionContext as any)['result'] = result;
          }
        }
        
        if (error) {
          // Always log errors
          const errorMessage = options?.message
            ? (typeof options.message === 'function' ? options.message(args, undefined) : options.message)
            : `Failed ${methodName}`;
          
          telemetryService.logError(errorMessage, error);
        } else if (options?.logExit) {
          // Log successful completion
          const exitMessage = options.message
            ? (typeof options.message === 'function' ? options.message(args, result) : options.message)
            : `Completed ${methodName}`;
          
          telemetryService.log(exitMessage, completionContext, logLevel);
        }
      };
      
      try {
        const result = originalMethod.apply(this, args);
        
        // Handle async methods
        if (result && typeof result === 'object' && typeof result.then === 'function') {
          return result.then(
            (value: any) => {
              if (!options?.onError || options.logExit) {
                logCompletion(value);
              }
              return value;
            },
            (error: Error) => {
              logCompletion(undefined, error);
              throw error;
            }
          );
        }
        
        // Sync methods
        if (!options?.onError || options.logExit) {
          logCompletion(result);
        }
        return result;
        
      } catch (error) {
        logCompletion(undefined, error as Error);
        throw error;
      }
    };
    
    return descriptor;
  };
}


/**
 * Create a logger for imperative use
 */
export function createLogger<TArgs extends any[], TReturn>(
  telemetryService: any,
  methodName: string,
  options?: LoggedOptions<TArgs, TReturn>
) {
  const logLevel = options?.level || 'info';
  
  return {
    logEntry(args: TArgs): void {
      if (!telemetryService?.log || !options?.logEntry) {
        return;
      }
      
      const message = options.message 
        ? (typeof options.message === 'function' ? options.message(args) : options.message)
        : `Entering ${methodName}`;
      
      const context: Record<string, any> = { method: methodName };
      
      if (options.includeArgs) {
        if (typeof options.includeArgs === 'function') {
          context['args'] = options.includeArgs(args);
        } else {
          context['args'] = args;
        }
      }
      
      telemetryService.log(message, context, 'debug');
    },
    
    logExit(args: TArgs, result: TReturn, duration: number): void {
      if (!telemetryService?.log || !options?.logExit) {
        return;
      }
      
      const message = options.message
        ? (typeof options.message === 'function' ? options.message(args, result) : options.message)
        : `Completed ${methodName}`;
      
      const context: Record<string, any> = { 
        method: methodName,
        duration
      };
      
      if (options.includeResult) {
        if (typeof options.includeResult === 'function') {
          context['result'] = options.includeResult(result);
        } else {
          context['result'] = result;
        }
      }
      
      telemetryService.log(message, context, logLevel);
    },
    
    logError(args: TArgs, error: Error): void {
      if (!telemetryService?.logError) {
        return;
      }
      
      const message = options?.message
        ? (typeof options.message === 'function' ? options.message(args) : options.message)
        : `Failed ${methodName}`;
      
      telemetryService.logError(message, error);
    }
  };
}
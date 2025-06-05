import { getTelemetryContext } from './telemetry.decorator';
import { 
  TracedOptions, 
  SignalTraceOptions, 
  ComputedTraceOptions, 
  EffectTraceOptions
} from './types';
import {
  MethodArgs,
  UnwrappedReturnType,
  UnwrapPromise
} from './type-inference';

/**
 * Universal @Traced decorator that automatically detects its target and applies appropriate telemetry.
 * 
 * @example
 * ```typescript
 * @Traced()  // Applied to class
 * class MyService {
 *   @Traced()  // Applied to signal
 *   items = signal([]);
 *   
 *   @Traced()  // Applied to method
 *   async loadData() { }
 * }
 * ```
 * 
 * @example With automatic type inference:
 * ```typescript
 * class UserService {
 *   @Traced<UserService, 'getUser'>({
 *     attributes: ([userId]) => ({
 *       'user.id': userId  // TypeScript knows this is string
 *     })
 *   })
 *   getUser(userId: string): User {
 *     // Method implementation
 *   }
 * }
 * ```
 */

// Overload for no type parameters
export function Traced(
  options?: TracedOptions<any[], any> | string
): MethodDecorator;

// Overload for explicit array types
export function Traced<TArgs extends any[], TReturn>(
  options?: TracedOptions<TArgs, UnwrapPromise<TReturn>> | string
): MethodDecorator;

// Overload for class-based type inference
export function Traced<T extends object, K extends keyof T>(
  options?: TracedOptions<MethodArgs<T, K>, UnwrappedReturnType<T, K>> | string
): MethodDecorator;

// Implementation
export function Traced(
  options?: TracedOptions<any[], any> | string
): any {
  // Overload for legacy support
  return function (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor | number): any {
    // Normalize options
    const opts = typeof options === 'string' 
      ? { spanName: options } 
      : options || {};
    
    // Class decorator
    if (!propertyKey && typeof descriptor !== 'number') {
      return traceClass(target, opts as TracedOptions<any, any>);
    }
    
    // Method decorator
    if (descriptor && typeof descriptor === 'object' && 'value' in descriptor) {
      return traceMethod(target, propertyKey!, descriptor, opts as TracedOptions<any, any>);
    }
    
    // Property decorator (for signals)
    if (propertyKey && !descriptor) {
      return traceProperty(target, propertyKey, opts as TracedOptions<any, any>);
    }
    
    // Parameter decorator (not implemented yet)
    if (typeof descriptor === 'number') {
      console.warn('@Traced parameter decorator not yet implemented');
      return;
    }
  };
}


/**
 * Trace a class (component lifecycle)
 */
function traceClass(constructor: any, options: TracedOptions): any {
  const className = options.spanName || constructor.name;
  
  // Store class-level tracing options
  Reflect.defineMetadata('traced:className', className, constructor);
  Reflect.defineMetadata('traced:classOptions', options, constructor);
  
  // Trace Angular lifecycle methods
  const lifecycleMethods = [
    'ngOnInit',
    'ngOnDestroy',
    'ngOnChanges',
    'ngAfterViewInit',
    'ngAfterViewChecked',
    'ngAfterContentInit',
    'ngAfterContentChecked'
  ];
  
  lifecycleMethods.forEach(method => {
    if (constructor.prototype[method]) {
      const original = constructor.prototype[method];
      constructor.prototype[method] = function(...args: any[]) {
        const telemetryService = (this as any)['telemetryService'] || (this as any)['_telemetryService'];
        
        if (telemetryService?.withSpan) {
          const attributes = typeof options.attributes === 'function'
            ? options.attributes(args)
            : options.attributes || {};
            
          return telemetryService.withSpan(
            `${className}.${method}`,
            () => original.apply(this, args),
            {
              ...attributes,
              'lifecycle.method': method
            }
          );
        }
        
        return original.apply(this, args);
      };
    }
  });
  
  return constructor;
}

/**
 * Trace a method
 */
function traceMethod<TArgs extends any[] = any[], TReturn = any>(
  target: any,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
  options: TracedOptions<TArgs, TReturn>
): PropertyDescriptor {
  const originalMethod = descriptor.value!;
  const context = getTelemetryContext(target, String(propertyKey));
  const spanName = options.spanName || context.fullName || String(propertyKey);
  
  descriptor.value = function(this: any, ...args: TArgs) {
    const telemetryService = (this as any)['telemetryService'] || (this as any)['_telemetryService'];
    
    if (!telemetryService?.withSpan) {
      return originalMethod.apply(this, args);
    }
    
    // Start timing if warning threshold is set
    const startTime = options.warnOnSlowOperation ? performance.now() : 0;
    
    // Execute with span
    const executeWithSpan = () => {
      const result = originalMethod.apply(this, args);
      
      // Handle async methods
      if (result && typeof result === 'object' && typeof result.then === 'function') {
        return result.then(
          (value: any) => {
            checkSlowOperation(spanName, startTime, options.warnOnSlowOperation);
            return value;
          },
          (error: any) => {
            checkSlowOperation(spanName, startTime, options.warnOnSlowOperation);
            throw error;
          }
        );
      }
      
      // Sync methods
      checkSlowOperation(spanName, startTime, options.warnOnSlowOperation);
      return result;
    };
    
    // Calculate attributes
    let attributes: Record<string, any> = {};
    if (options.attributes) {
      if (typeof options.attributes === 'function') {
        // For methods, we can provide args but result isn't available yet
        attributes = options.attributes(args, undefined as any);
      } else {
        attributes = options.attributes;
      }
    }
    
    return telemetryService.withSpan(spanName, executeWithSpan, attributes);
  };
  
  return descriptor;
}

/**
 * Trace a property (signals, computed, effects)
 */
function traceProperty(target: any, propertyKey: string | symbol, options: TracedOptions): void {
  let value: any;
  const context = getTelemetryContext(target, String(propertyKey));
  const baseName = options.spanName || context.fullName || String(propertyKey);
  
  const getter = function(this: any) {
    return value;
  };
  
  const setter = function(this: any, newValue: any) {
    const telemetryService = (this as any)['telemetryService'] || (this as any)['_telemetryService'];
    
    if (!telemetryService) {
      value = newValue;
      return;
    }
    
    // Detect signal types and apply appropriate tracing
    if (isSignal(newValue)) {
      value = telemetryService.createTracedSignal(
        newValue(),  // Get initial value
        baseName,
        options as SignalTraceOptions
      );
    } else if (isComputed(newValue)) {
      value = telemetryService.createTracedComputed(
        newValue,  // The computation function
        baseName,
        options as ComputedTraceOptions
      );
    } else if (isEffect(newValue)) {
      value = telemetryService.createTracedEffect(
        newValue,  // The effect function
        baseName,
        options as EffectTraceOptions
      );
    } else {
      // Regular property
      value = newValue;
    }
  };
  
  // Delete existing property
  if (delete (target as any)[propertyKey]) {
    Object.defineProperty(target, propertyKey, {
      get: getter,
      set: setter,
      enumerable: true,
      configurable: true
    });
  }
}

/**
 * Check if value is a signal
 */
function isSignal(value: any): boolean {
  return typeof value === 'function' && 
         (value.name === 'signal' || value.toString().includes('signal'));
}

/**
 * Check if value is a computed
 */
function isComputed(value: any): boolean {
  return typeof value === 'function' && 
         (value.name === 'computed' || value.toString().includes('computed'));
}

/**
 * Check if value is an effect
 */
function isEffect(value: any): boolean {
  return typeof value === 'function' && 
         (value.name === 'effect' || value.toString().includes('effect'));
}

/**
 * Check and warn for slow operations
 */
function checkSlowOperation(name: string, startTime: number, threshold?: number): void {
  if (threshold && startTime > 0) {
    const duration = performance.now() - startTime;
    if (duration > threshold) {
      console.warn(`Slow operation detected: ${name} took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`);
    }
  }
}
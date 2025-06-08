import { isSignal } from '@angular/core';
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

// Overload for no type parameters - works for all decorator types
export function Traced(
  options?: TracedOptions<any[], any> | string
): MethodDecorator & PropertyDecorator & ClassDecorator;

// Overload for explicit array types
export function Traced<TArgs extends any[], TReturn>(
  options?: TracedOptions<TArgs, UnwrapPromise<TReturn>> | string
): MethodDecorator & PropertyDecorator;

// Overload for class-based type inference
export function Traced<T extends object, K extends keyof T>(
  options?: TracedOptions<MethodArgs<T, K>, UnwrappedReturnType<T, K>> | string
): MethodDecorator & PropertyDecorator;

// Implementation
export function Traced(
  options?: TracedOptions<any[], any> | string
): any {
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
      traceProperty(target, propertyKey, opts as TracedOptions<any, any>);
      return;
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
 * This works by replacing the property descriptor to intercept the initial assignment
 */
function traceProperty(target: any, propertyKey: string | symbol, options: TracedOptions): void {
  const context = getTelemetryContext(target, String(propertyKey));
  const baseName = options.spanName || context.fullName || String(propertyKey);
  
  // Store the property key and options on the prototype for later use
  const tracedPropsKey = Symbol.for('__traced_properties__');
  if (!target[tracedPropsKey]) {
    target[tracedPropsKey] = new Map();
  }
  target[tracedPropsKey].set(propertyKey, { baseName, options });
  
  // Create a unique symbol for storing the actual value
  const valueKey = Symbol.for(`__traced_${String(propertyKey)}__`);
  
  // Define the property with getter/setter
  Object.defineProperty(target, propertyKey, {
    get(this: any) {
      return this[valueKey];
    },
    set(this: any, newValue: any) {
      const telemetryService = this['telemetryService'] || this['_telemetryService'];
      
      if (!telemetryService || !telemetryService.createTracedSignal) {
        // No telemetry service available, just store the value
        this[valueKey] = newValue;
        return;
      }
      
      // Check what type of value we're dealing with
      if (isSignal(newValue)) {
        // Check if it's a writable signal or readonly
        if (isWritableSignal(newValue)) {
          // It's a writable signal - wrap it with telemetry
          const tracedSignal = telemetryService.createTracedSignal(
            newValue(),  // Get initial value from the signal
            baseName,
            options as SignalTraceOptions
          );
          this[valueKey] = tracedSignal;
        } else {
          // It's a readonly signal (including computed) - wrap it in a traced computed for telemetry
          if (telemetryService.createTracedComputed) {
            const tracedReadonlySignal = telemetryService.createTracedComputed(
              newValue,  // Pass the signal function itself to maintain reactivity
              baseName,
              {
                ...options,
                spanName: options.spanName || `${baseName}.read`
              } as ComputedTraceOptions
            );
            this[valueKey] = tracedReadonlySignal;
          } else {
            // Fallback if telemetry service doesn't support computed
            this[valueKey] = newValue;
            console.debug(`@Traced: ${baseName} is a readonly signal, passing through without wrapping`);
          }
        }
      } else if (isEffect(newValue)) {
        // It's an effect
        // Effects are created differently - they return an EffectRef
        // We can't directly wrap the effect, but we can track it
        telemetryService.createTracedEffect(
          () => {
            // We can't directly access the effect function, but we can monitor its lifecycle
            console.log(`Effect ${baseName} is running`);
          },
          baseName,
          options as EffectTraceOptions
        );
        // Store the original effect ref
        this[valueKey] = newValue;
      } else {
        // Regular property or non-traced value
        this[valueKey] = newValue;
      }
    },
    enumerable: true,
    configurable: true
  });
}

/**
 * Check if value is a writable signal
 */
function isWritableSignal(value: any): boolean {
  return isSignal(value) && 'set' in value && 'update' in value;
}

/**
 * Check if value is a readonly signal (Signal but not WritableSignal)
 */
function isReadonlySignal(value: any): boolean {
  return isSignal(value) && !('set' in value) && !('update' in value);
}

/**
 * Check if value is a computed signal
 * Note: Computed signals are a type of readonly signal in Angular
 */
function isComputedSignal(value: any): boolean {
  // Computed signals are signals without set/update methods
  // We can't easily distinguish computed from other readonly signals without accessing internal symbols
  // For our purposes, we'll treat all readonly signals similarly
  return isReadonlySignal(value);
}

/**
 * Check if value is an effect
 */
function isEffect(value: any): boolean {
  return typeof value === 'object' && 
         value !== null &&
         'destroy' in value;
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
import 'reflect-metadata';
import { TELEMETRY_METADATA, TelemetryConfig, TelemetryContext } from './types';

/**
 * Class decorator that establishes telemetry context and namespace for all telemetry within the class.
 * 
 * @example
 * ```typescript
 * @Telemetry('shop.cart')
 * export class CartService {
 *   // All telemetry in this class will be namespaced under 'shop.cart'
 * }
 * ```
 */
export function Telemetry(options?: TelemetryConfig | string): ClassDecorator {
  return function (constructor: any) {
    const config: TelemetryConfig = typeof options === 'string' 
      ? { namespace: options } 
      : options || {};
    
    // Use provided namespace or derive from class name
    const namespace = config.namespace || constructor.name;
    
    // Store telemetry context as metadata
    Reflect.defineMetadata(TELEMETRY_METADATA.NAMESPACE, namespace, constructor);
    Reflect.defineMetadata(TELEMETRY_METADATA.CONFIG, config, constructor);
    
    // Auto-instrument lifecycle methods if requested
    if (config.autoInstrument?.lifecycle !== false) {
      instrumentLifecycleMethods(constructor, namespace, config);
    }
    
    // Auto-instrument all methods if requested
    if (config.autoInstrument?.methods) {
      instrumentAllMethods(constructor, namespace, config);
    }
    
    return constructor;
  };
}

/**
 * Get telemetry context from a class or instance
 */
export function getTelemetryContext(target: any, propertyKey?: string): TelemetryContext {
  const constructor = target.constructor || target;
  const namespace = Reflect.getMetadata(TELEMETRY_METADATA.NAMESPACE, constructor);
  const config = Reflect.getMetadata(TELEMETRY_METADATA.CONFIG, constructor) || {};
  
  let fullName = propertyKey || '';
  if (namespace && propertyKey) {
    fullName = `${namespace}.${propertyKey}`;
  } else if (namespace && !propertyKey) {
    fullName = namespace;
  }
  
  return {
    namespace,
    fullName,
    config
  };
}

/**
 * Instrument Angular lifecycle methods
 */
function instrumentLifecycleMethods(constructor: any, namespace: string, config: TelemetryConfig): void {
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
    const original = constructor.prototype[method];
    if (original && typeof original === 'function') {
      constructor.prototype[method] = function(...args: any[]) {
        const telemetryService = (this as any)['telemetryService'] || (this as any)['_telemetryService'];
        
        if (telemetryService && telemetryService.withSpan) {
          return telemetryService.withSpan(
            `${namespace}.${method}`,
            () => original.apply(this, args),
            {
              'lifecycle.method': method,
              'component.name': namespace
            }
          );
        }
        
        return original.apply(this, args);
      };
    }
  });
}

/**
 * Instrument all methods in a class
 */
function instrumentAllMethods(constructor: any, namespace: string, config: TelemetryConfig): void {
  const prototype = constructor.prototype;
  const propertyNames = Object.getOwnPropertyNames(prototype);
  
  propertyNames.forEach(propertyName => {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);
    
    if (descriptor && 
        typeof descriptor.value === 'function' && 
        propertyName !== 'constructor' &&
        !propertyName.startsWith('ng')) {
      
      const original = descriptor.value;
      
      descriptor.value = function(...args: any[]) {
        const telemetryService = (this as any)['telemetryService'] || (this as any)['_telemetryService'];
        
        if (telemetryService && telemetryService.withSpan) {
          return telemetryService.withSpan(
            `${namespace}.${propertyName}`,
            () => original.apply(this, args),
            {
              'method.name': propertyName,
              'method.class': namespace
            }
          );
        }
        
        return original.apply(this, args);
      };
      
      Object.defineProperty(prototype, propertyName, descriptor);
    }
  });
}